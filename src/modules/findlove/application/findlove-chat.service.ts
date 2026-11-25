import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import type { Message } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import {
  type ChatConnection,
  FindLoveChatRepository,
} from "../infrastructure/findlove-chat.repository.js";
import { FindLoveRepository } from "../infrastructure/findlove.repository.js";
import { toLoveProfileResponse } from "../mappers/findlove.mapper.js";

/** While a request is pending, each side may send this many messages (the note and one reply). */
const PENDING_MESSAGE_LIMIT = 1;

/**
 * Chats between FindLove members. Members only ever see each other's
 * FindLove profile here, never their Eventis account.
 */
@Injectable()
export class FindLoveChatService {
  constructor(
    private readonly profiles: FindLoveRepository,
    private readonly chats: FindLoveChatRepository,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  private readonly photoUrl = (key: string) => this.storage.getPublicUrl(key);

  async listChats(userId: string) {
    const me = await this.requireProfile(userId);
    const connections = await this.chats.listOpenConnections(me.id);
    const conversationIds = connections
      .map((connection) => connection.conversationId)
      .filter((id): id is string => !!id);
    const summaries = await this.chats.summaries(conversationIds, userId);

    const items = connections
      .map((connection) => {
        const summary = connection.conversationId
          ? summaries.get(connection.conversationId)
          : undefined;
        const lastMessage = summary?.messages.at(-1);
        // Accepted connections always get a row; pending ones only once someone has written.
        if (connection.status === "PENDING" && !lastMessage) return null;
        const other = otherProfile(connection, me.id);
        return {
          profileId: other.id,
          connectionId: connection.id,
          connectionStatus: connection.status,
          profile: toLoveProfileResponse(other, this.photoUrl),
          lastMessage: lastMessage ? this.presentMessage(lastMessage, userId) : null,
          ...(connection.status === "PENDING" ? { pendingMessages: summary?.messages.map(message => this.presentMessage(message, userId)) ?? [] } : {}),
          unreadCount: summary?.unreadCount ?? 0,
          readAt: summary?.readAt?.toISOString() ?? null,
          updatedAt: (lastMessage?.createdAt ?? connection.updatedAt).toISOString(),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      items,
      totalUnread: items.reduce((sum, item) => sum + item.unreadCount, 0),
    };
  }

  async listMessages(
    userId: string,
    profileId: string,
    input: { before?: Date | undefined; limit: number },
  ) {
    const { me, connection } = await this.requireChat(userId, profileId);
    const conversationId = await this.chats.ensureConversation(connection);
    const [messages, otherReadAt] = await Promise.all([
      this.chats.listMessages({ conversationId, before: input.before, limit: input.limit }),
      this.chats.otherReadAt(conversationId, userId),
    ]);
    return {
      profileId: otherProfile(connection, me.id).id,
      connectionStatus: connection.status,
      otherReadAt: otherReadAt?.toISOString() ?? null,
      canSend: await this.canSend(connection, conversationId, userId),
      items: messages.map((message) => this.presentMessage(message, userId)),
      hasMore: messages.length === input.limit,
    };
  }

  async sendMessage(
    userId: string,
    profileId: string,
    input: { text: string; clientMessageId?: string | undefined },
  ) {
    const text = input.text.trim();
    if (!text) throw AppError.validation({ text: ["Write a message first"] });
    const { connection } = await this.requireChat(userId, profileId);

    // Retries with the same clientMessageId return the first copy instead of sending twice.
    if (input.clientMessageId) {
      const existing = await this.chats.findByClientId(userId, input.clientMessageId);
      if (existing) return { message: this.presentMessage(existing, userId) };
    }

    const conversationId = await this.chats.ensureConversation(connection);
    if (!(await this.canSend(connection, conversationId, userId))) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "You can send one message while the request is waiting. Chat freely once you're connected.",
      );
    }
    const message = await this.chats.createMessage({
      conversationId,
      senderId: userId,
      content: text,
      clientMessageId: input.clientMessageId ?? null,
    });
    return { message: this.presentMessage(message, userId) };
  }

  async markRead(userId: string, profileId: string) {
    const { connection } = await this.requireChat(userId, profileId);
    const readAt = this.clock.now();
    if (connection.conversationId) {
      await this.chats.markRead(connection.conversationId, userId, readAt);
    }
    return { readAt: readAt.toISOString() };
  }

  private async canSend(connection: ChatConnection, conversationId: string, userId: string) {
    if (connection.status === "ACCEPTED") return true;
    const sent = await this.chats.countMessagesFrom(conversationId, userId);
    return sent < PENDING_MESSAGE_LIMIT;
  }

  private async requireChat(userId: string, profileId: string) {
    const me = await this.requireProfile(userId);
    if (profileId === me.id) throw AppError.notFound("That chat");
    const connection = await this.chats.findOpenConnection(me.id, profileId);
    if (!connection) throw AppError.notFound("That chat");
    return { me, connection };
  }

  private async requireProfile(userId: string) {
    const profile = await this.profiles.getProfile(userId);
    if (!profile) throw AppError.notFound("Your Love profile");
    return profile;
  }

  private presentMessage(message: Pick<Message, "id" | "clientMessageId" | "senderId" | "content" | "createdAt">, viewerId: string) {
    return {
      id: message.id,
      clientMessageId: message.clientMessageId,
      kind: "text" as const,
      text: message.content ?? "",
      own: message.senderId === viewerId,
      sentAt: message.createdAt.toISOString(),
    };
  }
}

function otherProfile(connection: ChatConnection, myProfileId: string) {
  return connection.fromProfileId === myProfileId
    ? connection.toProfile
    : connection.fromProfile;
}
