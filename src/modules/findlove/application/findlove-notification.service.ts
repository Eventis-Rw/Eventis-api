import { Injectable, Logger } from "@nestjs/common";
import type { Notification } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { FindLoveNotificationRepository } from "../infrastructure/findlove-notification.repository.js";

/** Stored notification types, and the short kind the app shows an icon for. */
export const FINDLOVE_NOTIFICATION_TYPES = {
  REQUEST_RECEIVED: "findlove.request_received",
  REQUEST_ACCEPTED: "findlove.request_accepted",
  MATCHED: "findlove.matched",
} as const;

const KIND_BY_TYPE: Record<string, "request" | "connection"> = {
  [FINDLOVE_NOTIFICATION_TYPES.REQUEST_RECEIVED]: "request",
  [FINDLOVE_NOTIFICATION_TYPES.REQUEST_ACCEPTED]: "connection",
  [FINDLOVE_NOTIFICATION_TYPES.MATCHED]: "connection",
};

const NOTE_PREVIEW_MAX = 120;

/** The FindLove side of a member, as a notification may name it. Never their Eventis account. */
interface NotifiedProfile {
  id: string;
  username: string;
}

interface StoredData {
  profileId?: string;
  connectionId?: string;
  username?: string;
  tab?: "received" | "sent";
}

/**
 * FindLove activity for the in-app notification feed. Notifications only ever
 * name the other member by their FindLove username.
 *
 * Sending is best effort: a notification that fails to save is logged and
 * never undoes the action that caused it.
 */
@Injectable()
export class FindLoveNotificationService {
  private readonly logger = new Logger(FindLoveNotificationService.name);

  constructor(
    private readonly notifications: FindLoveNotificationRepository,
    private readonly clock: Clock,
  ) {}

  /** Tells the recipient someone wants to connect, with a preview of their note. */
  async requestReceived(input: {
    recipientUserId: string;
    sender: NotifiedProfile;
    connectionId: string;
    note: string | null;
  }): Promise<void> {
    const note = input.note?.trim();
    await this.send({
      userId: input.recipientUserId,
      type: FINDLOVE_NOTIFICATION_TYPES.REQUEST_RECEIVED,
      title: `${input.sender.username} sent you a connection request`,
      body: note
        ? `“${preview(note)}” Open Inbox › Received to reply, accept or decline.`
        : "Open Inbox › Received to accept or decline.",
      data: {
        profileId: input.sender.id,
        username: input.sender.username,
        connectionId: input.connectionId,
        tab: "received",
      },
    });
  }

  /** Tells the sender their request was accepted. Declines are not announced. */
  async requestAccepted(input: {
    senderUserId: string;
    accepter: NotifiedProfile;
    connectionId: string;
  }): Promise<void> {
    await this.send({
      userId: input.senderUserId,
      type: FINDLOVE_NOTIFICATION_TYPES.REQUEST_ACCEPTED,
      title: `${input.accepter.username} accepted your request`,
      body: "You're connected. Say hello in your chats.",
      data: {
        profileId: input.accepter.id,
        username: input.accepter.username,
        connectionId: input.connectionId,
      },
    });
  }

  /** Tells a member that someone they liked liked them back, so they're now connected. */
  async matched(input: {
    userId: string;
    other: NotifiedProfile;
    connectionId: string;
  }): Promise<void> {
    await this.send({
      userId: input.userId,
      type: FINDLOVE_NOTIFICATION_TYPES.MATCHED,
      title: `You and ${input.other.username} liked each other`,
      body: "You're connected. Say hello in your chats.",
      data: {
        profileId: input.other.id,
        username: input.other.username,
        connectionId: input.connectionId,
      },
    });
  }

  async list(userId: string, input: { page: number; limit: number; unreadOnly: boolean }) {
    const { items, total, unreadCount } = await this.notifications.list({
      userId,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      unreadOnly: input.unreadOnly,
    });
    return {
      items: items.map(present),
      page: input.page,
      limit: input.limit,
      total,
      unreadCount,
    };
  }

  async markRead(userId: string, id: string) {
    const row = await this.notifications.markRead(userId, id, this.clock.now());
    if (!row) throw AppError.notFound("That notification");
    return present(row);
  }

  async markAllRead(userId: string) {
    return { updated: await this.notifications.markAllRead(userId, this.clock.now()) };
  }

  private async send(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data: StoredData & Record<string, string>;
  }): Promise<void> {
    try {
      await this.notifications.create(input);
    } catch (error) {
      this.logger.warn(
        `Could not save FindLove notification ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function present(row: Notification) {
  const data = (row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}) as StoredData;
  return {
    id: row.id,
    type: row.type,
    kind: KIND_BY_TYPE[row.type] ?? "connection",
    title: row.title,
    body: row.body,
    profileId: data.profileId ?? null,
    connectionId: data.connectionId ?? null,
    tab: data.tab ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ");
  return flat.length > NOTE_PREVIEW_MAX ? `${flat.slice(0, NOTE_PREVIEW_MAX - 1).trimEnd()}…` : flat;
}
