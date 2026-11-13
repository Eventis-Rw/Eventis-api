import { Injectable } from "@nestjs/common";
import type {
  Call as PrismaCall,
  ChatInvitation as PrismaInvitation,
  ConnectionRequest as PrismaConnection,
  Conversation as PrismaConversation,
  ConversationParticipant as PrismaParticipant,
  Message as PrismaMessage,
  MessageAttachment as PrismaAttachment,
  MessageReceipt as PrismaReceipt,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type {
  AttachmentRecord,
  CallRecord,
  CallStatus,
  CallType,
  ConnectionRequestRecord,
  ConversationListItem,
  ConversationRecord,
  ConversationType,
  InvitationRecord,
  MessageRecord,
  MessageType,
  ParticipantRecord,
  ReceiptRecord,
  ReceiptStatus,
} from "../domain/chat.js";
import { CONTACT_SYNC_MAX, PolicyViolationError } from "../domain/chat.js";
import type {
  ConnectionFacts,
  EventFacts,
  MessagingService,
  PolicyActor,
} from "../domain/messaging-policy.js";

const conversationInclude = {
  participants: true,
  connectionRequest: true,
} as const;

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConversationById(id: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      include: conversationInclude,
    });
    return row ? toConversation(row) : null;
  }

  async findDirectByPairKey(
    directPairKey: string,
  ): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { directPairKey },
      include: conversationInclude,
    });
    return row ? toConversation(row) : null;
  }

  async createConversation(input: {
    type: ConversationType;
    service: MessagingService;
    contextId: string | null;
    title: string | null;
    directPairKey: string | null;
    participantUserIds: string[];
    connection?: { requesterId: string; recipientId: string };
  }): Promise<ConversationRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          type: input.type,
          service: input.service,
          contextId: input.contextId,
          title: input.title,
          directPairKey: input.directPairKey,
          participants: {
            create: input.participantUserIds.map((userId) => ({ userId })),
          },
        },
        include: conversationInclude,
      });
      if (!input.connection) return created;
      const request = await tx.connectionRequest.create({
        data: {
          requesterId: input.connection.requesterId,
          recipientId: input.connection.recipientId,
          conversationId: created.id,
          status: "PENDING",
        },
      });
      return tx.conversation.update({
        where: { id: created.id },
        data: { contextId: request.id },
        include: conversationInclude,
      });
    });
    return toConversation(row);
  }

  async listConversationsForUser(input: {
    userId: string;
    service: MessagingService;
    archived: boolean;
    page: number;
    limit: number;
  }): Promise<{ items: ConversationListItem[]; total: number }> {
    const where: Prisma.ConversationWhereInput = {
      service: input.service,
      participants: {
        some: {
          userId: input.userId,
          isArchived: input.archived,
          hiddenAt: null,
        },
      },
    };
    const skip = (input.page - 1) * input.limit;
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          ...conversationInclude,
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            include: { attachments: true, receipts: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: input.limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const items: ConversationListItem[] = [];
    for (const row of rows) {
      const conversation = toConversation(row);
      const mine = conversation.participants.find(
        (p) => p.userId === input.userId,
      );
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: row.id,
          deletedAt: null,
          senderId: { not: input.userId },
          ...(mine?.lastReadAt ? { createdAt: { gt: mine.lastReadAt } } : {}),
        },
      });
      items.push({
        ...conversation,
        lastMessage: row.messages[0] ? toMessage(row.messages[0]) : null,
        unreadCount,
      });
    }
    return { items, total };
  }

  async updateParticipantSettings(input: {
    conversationId: string;
    userId: string;
    isArchived?: boolean;
    isMuted?: boolean;
    lastReadAt?: Date;
  }): Promise<ParticipantRecord> {
    const row = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      data: {
        ...(input.isArchived !== undefined
          ? { isArchived: input.isArchived }
          : {}),
        ...(input.isMuted !== undefined ? { isMuted: input.isMuted } : {}),
        ...(input.lastReadAt !== undefined
          ? { lastReadAt: input.lastReadAt }
          : {}),
      },
    });
    return toParticipant(row);
  }

  async findLatestMessage(
    conversationId: string,
  ): Promise<{ id: string; createdAt: Date } | null> {
    const row = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true },
    });
    return row;
  }

  async clearConversation(input: {
    conversationId: string;
    userId: string;
    hiddenAt: Date;
    clearedBeforeMessageId: string | null;
  }): Promise<void> {
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      data: {
        hiddenAt: input.hiddenAt,
        clearedBeforeMessageId: input.clearedBeforeMessageId,
      },
    });
  }

  async unhideConversation(input: {
    conversationId: string;
    userId: string;
  }): Promise<void> {
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      data: { hiddenAt: null },
    });
  }

  async upsertContactAliases(
    ownerId: string,
    contacts: Array<{
      phone: string;
      contactUserId: string | null;
      firstName: string;
      lastName: string | null;
    }>,
  ): Promise<void> {
    if (!contacts.length) return;
    await this.prisma.$transaction(
      contacts.map((contact) =>
        this.prisma.contactAlias.upsert({
          where: {
            ownerId_phone: { ownerId, phone: contact.phone },
          },
          create: {
            ownerId,
            phone: contact.phone,
            contactUserId: contact.contactUserId,
            firstName: contact.firstName,
            lastName: contact.lastName,
          },
          update: {
            contactUserId: contact.contactUserId,
            firstName: contact.firstName,
            lastName: contact.lastName,
          },
        }),
      ),
    );
  }

  async listContactAliases(ownerId: string) {
    return this.prisma.contactAlias.findMany({
      where: { ownerId },
      orderBy: [{ firstName: "asc" }, { phone: "asc" }],
      take: CONTACT_SYNC_MAX,
    });
  }

  async updateContactAlias(
    ownerId: string,
    currentPhone: string,
    input: {
      phone: string;
      contactUserId: string | null;
      firstName: string;
      lastName: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (input.phone !== currentPhone) {
        await tx.contactAlias.delete({
          where: { ownerId_phone: { ownerId, phone: currentPhone } },
        });
      }
      return tx.contactAlias.upsert({
        where: { ownerId_phone: { ownerId, phone: input.phone } },
        create: {
          ownerId,
          phone: input.phone,
          contactUserId: input.contactUserId,
          firstName: input.firstName,
          lastName: input.lastName,
        },
        update: {
          contactUserId: input.contactUserId,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });
    });
  }

  async findMessageById(id: string): Promise<MessageRecord | null> {
    const row = await this.prisma.message.findUnique({
      where: { id },
      include: { attachments: true, receipts: true },
    });
    return row ? toMessage(row) : null;
  }

  async findMessageByClientId(
    senderId: string,
    clientMessageId: string,
  ): Promise<MessageRecord | null> {
    const row = await this.prisma.message.findUnique({
      where: {
        senderId_clientMessageId: { senderId, clientMessageId },
      },
      include: { attachments: true, receipts: true },
    });
    return row ? toMessage(row) : null;
  }

  async createMessage(input: {
    conversationId: string;
    senderId: string;
    type: MessageType;
    content: string | null;
    replyToId: string | null;
    clientMessageId: string | null;
    forwardedFromId?: string | null;
    recipientParticipantIds: string[];
    now: Date;
    pendingSenderLimit?: number;
  }): Promise<MessageRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.pendingSenderLimit !== undefined) {
        await tx.$queryRaw`
          SELECT id FROM connection_requests
          WHERE conversation_id = ${input.conversationId}::uuid
          FOR UPDATE`;
        const sent = await tx.message.count({
          where: {
            conversationId: input.conversationId,
            senderId: input.senderId,
          },
        });
        if (sent >= input.pendingSenderLimit) {
          throw new PolicyViolationError("PENDING_LIMIT_REACHED");
        }
      }
      const created = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          type: input.type,
          content: input.content,
          replyToId: input.replyToId,
          clientMessageId: input.clientMessageId,
          forwardedFromId: input.forwardedFromId ?? null,
          createdAt: input.now,
          updatedAt: input.now,
          receipts: {
            create: input.recipientParticipantIds.map((participantId) => ({
              participantId,
              status: "SENT",
            })),
          },
        },
        include: { attachments: true, receipts: true },
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: input.now },
      });
      return created;
    });
    return toMessage(row);
  }

  async listMessages(input: {
    conversationId: string;
    limit: number;
    beforeId?: string;
    after?: Date;
  }): Promise<MessageRecord[]> {
    let before: { createdAt: Date; id: string } | undefined;
    if (input.beforeId) {
      const cursor = await this.prisma.message.findUnique({
        where: { id: input.beforeId },
        select: { createdAt: true, id: true, conversationId: true },
      });
      if (cursor && cursor.conversationId === input.conversationId) {
        before = { createdAt: cursor.createdAt, id: cursor.id };
      }
    }
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        ...(input.after ? { createdAt: { gt: input.after } } : {}),
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { attachments: true, receipts: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
    return rows.map(toMessage).reverse();
  }

  async updateMessage(input: {
    id: string;
    content?: string | null;
    editedAt?: Date | null;
    deletedAt?: Date | null;
  }): Promise<MessageRecord> {
    const row = await this.prisma.message.update({
      where: { id: input.id },
      data: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.editedAt !== undefined ? { editedAt: input.editedAt } : {}),
        ...(input.deletedAt !== undefined
          ? { deletedAt: input.deletedAt }
          : {}),
      },
      include: { attachments: true, receipts: true },
    });
    return toMessage(row);
  }

  async addAttachment(input: {
    messageId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    durationMs?: number | null;
    width?: number | null;
    height?: number | null;
  }): Promise<AttachmentRecord> {
    const row = await this.prisma.messageAttachment.create({
      data: {
        messageId: input.messageId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        durationMs: input.durationMs ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
      },
    });
    return toAttachment(row);
  }

  async updateAttachmentMetadata(input: {
    id: string;
    durationMs?: number | null;
    width?: number | null;
    height?: number | null;
  }): Promise<AttachmentRecord | null> {
    const existing = await this.prisma.messageAttachment.findUnique({
      where: { id: input.id },
    });
    if (!existing) return null;
    const row = await this.prisma.messageAttachment.update({
      where: { id: input.id },
      data: {
        ...(input.durationMs !== undefined
          ? { durationMs: input.durationMs }
          : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      },
    });
    return toAttachment(row);
  }

  async findAttachmentById(
    id: string,
  ): Promise<
    (AttachmentRecord & { conversationId: string; senderId: string }) | null
  > {
    const row = await this.prisma.messageAttachment.findUnique({
      where: { id },
      include: {
        message: { select: { conversationId: true, senderId: true } },
      },
    });
    if (!row) return null;
    return {
      ...toAttachment(row),
      conversationId: row.message.conversationId,
      senderId: row.message.senderId,
    };
  }

  async markReceipts(input: {
    participantId: string;
    conversationId: string;
    status: ReceiptStatus;
    at: Date;
    messageId?: string;
  }): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.MessageReceiptWhereInput = {
        participantId: input.participantId,
        ...(input.messageId
          ? { messageId: input.messageId }
          : { message: { conversationId: input.conversationId } }),
        ...(input.status === "DELIVERED"
          ? { status: "SENT" }
          : { status: { in: ["SENT", "DELIVERED"] } }),
      };
      const updated = await tx.messageReceipt.updateMany({
        where,
        data:
          input.status === "READ"
            ? { status: "READ", readAt: input.at, deliveredAt: input.at }
            : { status: "DELIVERED", deliveredAt: input.at },
      });
      if (input.status === "READ") {
        await tx.conversationParticipant.update({
          where: { id: input.participantId },
          data: { lastReadAt: input.at },
        });
      }
      return updated.count;
    });
  }

  async findPendingInvitation(
    inviterId: string,
    phoneNumber: string,
    now: Date,
  ): Promise<InvitationRecord | null> {
    const row = await this.prisma.chatInvitation.findFirst({
      where: {
        inviterId,
        phoneNumber,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? toInvitation(row) : null;
  }

  async findInvitationByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<InvitationRecord | null> {
    const row = await this.prisma.chatInvitation.findFirst({
      where: {
        tokenHash,
        status: "PENDING",
        expiresAt: { gt: now },
      },
    });
    return row ? toInvitation(row) : null;
  }

  async acceptInvitation(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.chatInvitation.updateMany({
      where: { id, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED" },
    });
    return result.count === 1;
  }

  async createInvitation(input: {
    inviterId: string;
    phoneNumber: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRecord> {
    const row = await this.prisma.chatInvitation.create({ data: input });
    return toInvitation(row);
  }

  async listInvitations(inviterId: string): Promise<InvitationRecord[]> {
    const rows = await this.prisma.chatInvitation.findMany({
      where: { inviterId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(toInvitation);
  }

  async expireInvitations(now: Date): Promise<void> {
    await this.prisma.chatInvitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
  }

  async createCall(input: {
    conversationId: string;
    callerId: string;
    type: CallType;
    status: CallStatus;
  }): Promise<CallRecord> {
    const row = await this.prisma.call.create({ data: input });
    return toCall(row);
  }

  async findCallById(id: string): Promise<CallRecord | null> {
    const row = await this.prisma.call.findUnique({ where: { id } });
    return row ? toCall(row) : null;
  }

  async updateCall(input: {
    id: string;
    expectedStatus: CallStatus;
    status: CallStatus;
    answeredAt?: Date | null;
    endedAt?: Date | null;
  }): Promise<CallRecord | null> {
    const result = await this.prisma.call.updateMany({
      where: { id: input.id, status: input.expectedStatus },
      data: {
        status: input.status,
        ...(input.answeredAt !== undefined
          ? { answeredAt: input.answeredAt }
          : {}),
        ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
      },
    });
    if (result.count !== 1) return null;
    const row = await this.prisma.call.findUnique({ where: { id: input.id } });
    return row ? toCall(row) : null;
  }

  async listCallsForUser(input: {
    userId: string;
    service: MessagingService;
    page: number;
    limit: number;
  }): Promise<{ items: CallRecord[]; total: number }> {
    const where: Prisma.CallWhereInput = {
      conversation: {
        service: input.service,
        participants: { some: { userId: input.userId } },
      },
    };
    const skip = (input.page - 1) * input.limit;
    const [rows, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip,
        take: input.limit,
      }),
      this.prisma.call.count({ where }),
    ]);
    return { items: rows.map(toCall), total };
  }

  async loadMessagingFacts(input: {
    service: MessagingService;
    actorId: string;
    peerId: string | null;
    contextId: string | null;
    conversationId: string | null;
    now: Date;
  }): Promise<{
    blocked: boolean;
    actor: PolicyActor;
    peer: PolicyActor;
    connection: ConnectionFacts | null;
    event: EventFacts | null;
  }> {
    const userIds = [input.actorId, ...(input.peerId ? [input.peerId] : [])];
    const [users, actorSub, peerSub, block, connection, event] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, findLoveProfileType: true },
        }),
        this.hasSubscription(input.actorId, input.service, input.now),
        input.peerId
          ? this.hasSubscription(input.peerId, input.service, input.now)
          : Promise.resolve(false),
        input.peerId
          ? this.areBlocked(input.actorId, input.peerId)
          : Promise.resolve(false),
        this.findConnectionFacts(input, input.now),
        input.service === "EVENTIS" && input.contextId
          ? this.findEventFacts(input.contextId, input.actorId, input.peerId)
          : Promise.resolve(null),
      ]);
    const byId = new Map(users.map((user) => [user.id, user]));
    const actorUser = byId.get(input.actorId);
    const peerUser = input.peerId ? byId.get(input.peerId) : undefined;
    return {
      blocked: block,
      actor: {
        profileType: actorUser?.findLoveProfileType ?? "PRIVATE",
        hasEligibleSubscription: actorSub,
        hasPublishingPayment: false,
      },
      peer: {
        profileType: peerUser?.findLoveProfileType ?? "PRIVATE",
        hasEligibleSubscription: peerSub,
        hasPublishingPayment: false,
      },
      connection,
      event,
    };
  }

  async areBlocked(userA: string, userB: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      },
      select: { id: true },
    });
    return row !== null;
  }

  async createBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      update: {},
      create: { blockerId, blockedId },
    });
  }

  async deleteBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
  }

  async listBlockedIds(blockerId: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId },
      select: { blockedId: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row) => row.blockedId);
  }

  async createReport(input: {
    reporterId: string;
    reportedUserId: string;
    conversationId: string | null;
    reason: string;
    details: string | null;
  }): Promise<{ id: string }> {
    const row = await this.prisma.userReport.create({ data: input });
    return { id: row.id };
  }

  async updateConnectionStatus(input: {
    conversationId: string;
    actorId: string;
    status: "ACCEPTED" | "REJECTED" | "CANCELLED";
  }): Promise<ConnectionRequestRecord | null> {
    const current = await this.prisma.connectionRequest.findUnique({
      where: { conversationId: input.conversationId },
    });
    if (!current || current.status !== "PENDING") return null;
    const recipientAction =
      input.status === "ACCEPTED" || input.status === "REJECTED";
    if (recipientAction && current.recipientId !== input.actorId) return null;
    if (input.status === "CANCELLED" && current.requesterId !== input.actorId) {
      return null;
    }
    const updated = await this.prisma.connectionRequest.updateMany({
      where: { id: current.id, status: "PENDING" },
      data: { status: input.status },
    });
    if (updated.count !== 1) return null;
    const row = await this.prisma.connectionRequest.findUnique({
      where: { id: current.id },
    });
    return row ? toConnection(row) : null;
  }

  private async hasSubscription(
    userId: string,
    service: MessagingService,
    now: Date,
  ): Promise<boolean> {
    const row = await this.prisma.serviceSubscription.findFirst({
      where: { userId, service, expiresAt: { gt: now } },
      select: { id: true },
    });
    return row !== null;
  }

  private async findConnectionFacts(
    input: {
      conversationId: string | null;
      actorId: string;
      peerId: string | null;
    },
    _now: Date,
  ): Promise<ConnectionFacts | null> {
    const row = input.conversationId
      ? await this.prisma.connectionRequest.findUnique({
          where: { conversationId: input.conversationId },
        })
      : input.peerId
        ? await this.prisma.connectionRequest.findFirst({
            where: {
              OR: [
                { requesterId: input.actorId, recipientId: input.peerId },
                { requesterId: input.peerId, recipientId: input.actorId },
              ],
            },
            orderBy: { createdAt: "desc" },
          })
        : null;
    if (!row) return null;
    const messagesSentByActor = input.conversationId
      ? await this.prisma.message.count({
          where: {
            conversationId: input.conversationId,
            senderId: input.actorId,
            deletedAt: null,
          },
        })
      : 0;
    return {
      status: row.status,
      requesterId: row.requesterId,
      recipientId: row.recipientId,
      messagesSentByActor,
    };
  }

  private async findEventFacts(
    eventId: string,
    actorId: string,
    peerId: string | null,
  ): Promise<EventFacts | null> {
    const event = await this.prisma.event.findUnique({
      where: { eventId },
      select: { eventId: true, posterId: true, status: true },
    });
    if (!event) return null;
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        userId: { in: [actorId, ...(peerId ? [peerId] : [])] },
      },
      select: { userId: true },
    });
    const registered = new Set(registrations.map((row) => row.userId));
    return {
      eventId: event.eventId,
      posterId: event.posterId,
      status: event.status,
      actorIsRegistered: registered.has(actorId),
      peerIsRegistered: peerId ? registered.has(peerId) : false,
    };
  }
}

function toParticipant(row: PrismaParticipant): ParticipantRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    joinedAt: row.joinedAt,
    lastReadAt: row.lastReadAt,
    isArchived: row.isArchived,
    isMuted: row.isMuted,
    hiddenAt: row.hiddenAt,
    clearedBeforeMessageId: row.clearedBeforeMessageId,
  };
}

function toConversation(
  row: PrismaConversation & {
    participants: PrismaParticipant[];
    connectionRequest?: PrismaConnection | null;
  },
): ConversationRecord {
  return {
    id: row.id,
    type: row.type,
    service: row.service,
    contextId: row.contextId,
    title: row.title,
    directPairKey: row.directPairKey,
    connectionStatus: row.connectionRequest?.status ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    participants: row.participants.map(toParticipant),
  };
}

function toConnection(row: PrismaConnection): ConnectionRequestRecord {
  return {
    id: row.id,
    requesterId: row.requesterId,
    recipientId: row.recipientId,
    conversationId: row.conversationId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAttachment(row: PrismaAttachment): AttachmentRecord {
  return {
    id: row.id,
    messageId: row.messageId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
  };
}

function toReceipt(row: PrismaReceipt): ReceiptRecord {
  return {
    id: row.id,
    messageId: row.messageId,
    participantId: row.participantId,
    status: row.status,
    deliveredAt: row.deliveredAt,
    readAt: row.readAt,
  };
}

function toMessage(
  row: PrismaMessage & {
    attachments: PrismaAttachment[];
    receipts: PrismaReceipt[];
  },
): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    replyToId: row.replyToId,
    clientMessageId: row.clientMessageId,
    forwardedFromId: row.forwardedFromId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    attachments: row.attachments.map(toAttachment),
    receipts: row.receipts.map(toReceipt),
  };
}

function toInvitation(row: PrismaInvitation): InvitationRecord {
  return {
    id: row.id,
    inviterId: row.inviterId,
    phoneNumber: row.phoneNumber,
    tokenHash: row.tokenHash,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function toCall(row: PrismaCall): CallRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    callerId: row.callerId,
    type: row.type,
    status: row.status,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
  };
}
