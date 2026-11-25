import { Injectable } from "@nestjs/common";
import { Prisma, type LoveConnectionStatus, type Message } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

/** Connection states in which the two members may see their chat. */
export const CHAT_OPEN_STATUSES: LoveConnectionStatus[] = ["PENDING", "ACCEPTED"];

const withPhotos = {
  include: { photos: { orderBy: { position: "asc" as const } } },
};

export type ChatConnection = Prisma.LoveConnectionGetPayload<{
  include: {
    fromProfile: typeof withPhotos;
    toProfile: typeof withPhotos;
  };
}>;

/**
 * FindLove chats are stored in the shared conversations/messages tables with
 * service FINDLOVE, and each one is linked to its LoveConnection through
 * love_connections.conversation_id.
 */
@Injectable()
export class FindLoveChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The newest pending or accepted connection between two profiles. */
  async findOpenConnection(
    profileA: string,
    profileB: string,
  ): Promise<ChatConnection | null> {
    return this.prisma.loveConnection.findFirst({
      where: {
        status: { in: CHAT_OPEN_STATUSES },
        OR: [
          { fromProfileId: profileA, toProfileId: profileB },
          { fromProfileId: profileB, toProfileId: profileA },
        ],
      },
      include: { fromProfile: withPhotos, toProfile: withPhotos },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Every pending or accepted connection of a profile. */
  async listOpenConnections(profileId: string): Promise<ChatConnection[]> {
    return this.prisma.loveConnection.findMany({
      where: {
        status: { in: CHAT_OPEN_STATUSES },
        OR: [{ fromProfileId: profileId }, { toProfileId: profileId }],
      },
      include: { fromProfile: withPhotos, toProfile: withPhotos },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  /**
   * Creates the conversation behind a connection the first time it is needed.
   * The request note, if any, becomes the first message so both sides see it.
   * Safe to call concurrently: the loser of a race uses the winner's conversation.
   */
  async ensureConversation(connection: ChatConnection): Promise<string> {
    if (connection.conversationId) return connection.conversationId;
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: "DIRECT",
          service: "FINDLOVE",
          participants: {
            create: [
              { userId: connection.fromProfile.userId },
              { userId: connection.toProfile.userId },
            ],
          },
        },
      });
      const linked = await tx.loveConnection.updateMany({
        where: { id: connection.id, conversationId: null },
        data: { conversationId: conversation.id },
      });
      if (linked.count === 0) {
        await tx.conversation.delete({ where: { id: conversation.id } });
        const current = await tx.loveConnection.findUniqueOrThrow({
          where: { id: connection.id },
          select: { conversationId: true },
        });
        return current.conversationId!;
      }
      if (connection.message?.trim()) {
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderId: connection.fromProfile.userId,
            type: "TEXT",
            content: connection.message.trim(),
            createdAt: connection.createdAt,
          },
        });
      }
      return conversation.id;
    });
  }

  async listMessages(input: {
    conversationId: string;
    before?: Date | undefined;
    limit: number;
  }): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        deletedAt: null,
        ...(input.before ? { createdAt: { lt: input.before } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
    return rows.reverse();
  }

  async countMessagesFrom(conversationId: string, senderId: string): Promise<number> {
    return this.prisma.message.count({
      where: { conversationId, senderId, deletedAt: null },
    });
  }

  async findByClientId(senderId: string, clientMessageId: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: {
        senderId_clientMessageId: { senderId, clientMessageId },
      },
    });
  }

  async createMessage(input: {
    conversationId: string;
    senderId: string;
    content: string;
    clientMessageId: string | null;
  }): Promise<Message> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          type: "TEXT",
          content: input.content,
          clientMessageId: input.clientMessageId,
        },
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: message.createdAt },
      });
      // Sending counts as having read everything up to now.
      await tx.conversationParticipant.updateMany({
        where: { conversationId: input.conversationId, userId: input.senderId },
        data: { lastReadAt: message.createdAt },
      });
      return message;
    });
  }

  /** The last message and the viewer's unread count for each conversation. */
  async summaries(conversationIds: string[], viewerId: string) {
    type Preview = Pick<Message, "id" | "clientMessageId" | "senderId" | "content" | "createdAt">;
    type Summary = { messages: Preview[]; unreadCount: number; readAt: Date | null };
    const result = new Map<string, Summary>();
    if (!conversationIds.length) return result;
    // Limit history per conversation inside Postgres. A pending request has at most two messages.
    const rows = await this.prisma.$queryRaw<Array<{
      conversationId: string; readAt: Date | null; unreadCount: number;
      id: string | null; clientMessageId: string | null; senderId: string; content: string | null; createdAt: Date;
    }>>(Prisma.sql`
      SELECT p.conversation_id AS "conversationId", p.last_read_at AS "readAt",
             unread.n AS "unreadCount", m.id, m.client_message_id AS "clientMessageId",
             m.sender_id AS "senderId", m.content, m.created_at AS "createdAt"
      FROM conversation_participants p
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM messages
        WHERE conversation_id = p.conversation_id AND deleted_at IS NULL AND sender_id <> p.user_id
          AND (p.last_read_at IS NULL OR created_at > p.last_read_at)
      ) unread
      LEFT JOIN LATERAL (
        SELECT id, client_message_id, sender_id, content, created_at FROM messages
        WHERE conversation_id = p.conversation_id AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT 2
      ) m ON true
      WHERE p.user_id = ${viewerId}::uuid
        AND p.conversation_id IN (${Prisma.join(conversationIds.map(id => Prisma.sql`${id}::uuid`))})
      ORDER BY p.conversation_id, m.created_at, m.id
    `);
    for (const row of rows) {
      const summary = result.get(row.conversationId) ?? { messages: [], unreadCount: row.unreadCount, readAt: row.readAt };
      if (row.id) summary.messages.push({ id: row.id, clientMessageId: row.clientMessageId, senderId: row.senderId, content: row.content, createdAt: row.createdAt });
      result.set(row.conversationId, summary);
    }
    return result;
  }

  async markRead(conversationId: string, userId: string, at: Date): Promise<void> {
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: at },
    });
  }

  /** When the other member last read the chat, for "seen" ticks. */
  async otherReadAt(conversationId: string, viewerId: string): Promise<Date | null> {
    const other = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: viewerId } },
      select: { lastReadAt: true },
    });
    return other?.lastReadAt ?? null;
  }
}
