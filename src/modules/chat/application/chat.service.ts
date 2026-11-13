import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { ENV, type Env } from "../../../config/env.js";
import {
  StorageService,
  type UploadedFile,
} from "../../../infrastructure/storage/storage.service.js";
import {
  LookupUsersService,
  type PublicUserProfile,
} from "../../identity/index.js";
import {
  CALL_RATE,
  CONTACT_SYNC_MAX,
  CONTACT_SYNC_RATE,
  INVITATION_RATE,
  INVITATION_TTL_MS,
  MESSAGE_RATE,
  assertPolicyAllowed,
  canTransitionCall,
  directPairKey,
  generateInvitationToken,
  hashInvitationToken,
  normalizeContactPhone,
} from "../domain/chat.js";
import type {
  CallStatus,
  CallType,
  ConversationRecord,
  ConversationType,
  MessageRecord,
  MessageType,
} from "../domain/chat.js";
import type { MessagingService } from "../domain/messaging-policy.js";
import { DEFAULT_MESSAGING_SERVICE } from "../domain/messaging-policy.js";
import { messagingPolicies } from "../domain/policies.js";
import { ChatRateLimiter } from "../infrastructure/chat-rate-limiter.js";
import { ChatRealtimePublisher } from "../infrastructure/chat-realtime.publisher.js";
import { ChatRepository } from "../infrastructure/chat.repository.js";
import {
  toAttachmentResponse,
  toCallResponse,
  toConversationResponse,
  toInvitationResponse,
  toMessageResponse,
  type ChatPublicProfile,
} from "../mappers/chat.mapper.js";

const CALL_RING_TIMEOUT_MS = 45_000;

export interface ContactInput {
  name?: string | undefined;
  phoneNumber: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly chat: ChatRepository,
    private readonly users: LookupUsersService,
    private readonly storage: StorageService,
    private readonly clock: Clock,
    private readonly rateLimiter: ChatRateLimiter,
    private readonly realtime: ChatRealtimePublisher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  attachRealtimeServer(server: Server): void {
    this.realtime.attach(server);
  }

  registerRealtimeSocket(userId: string, socketId: string): void {
    this.realtime.register(userId, socketId);
  }

  unregisterRealtimeSocket(socketId: string): void {
    this.realtime.unregister(socketId);
  }

  async syncContacts(userId: string, contacts: ContactInput[]) {
    this.rateLimiter.consume(
      `contacts:${userId}`,
      this.clock.now(),
      CONTACT_SYNC_RATE.max,
      CONTACT_SYNC_RATE.windowMs,
    );
    if (contacts.length > CONTACT_SYNC_MAX) {
      throw AppError.validation({
        contacts: [`Submit no more than ${CONTACT_SYNC_MAX} contacts`],
      });
    }
    const [self] = await this.users.byIds([userId]);
    const normalized = contacts.map((contact) => ({
      name: contact.name?.trim() || null,
      originalPhoneNumber: contact.phoneNumber,
      phoneNumber: normalizeContactPhone(contact.phoneNumber),
    }));
    const phoneNumbers = [
      ...new Set(
        normalized.flatMap((contact) =>
          contact.phoneNumber ? [contact.phoneNumber] : [],
        ),
      ),
    ];
    const profiles = await this.users.byPhones(phoneNumbers);
    const byPhone = new Map(
      profiles.map((profile) => [profile.phone, profile]),
    );
    await this.chat.upsertContactAliases(
      userId,
      normalized.flatMap((contact) => {
        if (!contact.phoneNumber) return [];
        const matched = byPhone.get(contact.phoneNumber);
        const fallback = splitName(contact.name);
        return [
          {
            phone: contact.phoneNumber,
            contactUserId: matched?.id ?? null,
            firstName:
              matched?.firstName ?? fallback.firstName ?? "Contact",
            lastName: matched?.lastName ?? fallback.lastName,
          },
        ];
      }),
    );
    return {
      contacts: normalized.map((contact) => {
        const isSelf =
          contact.phoneNumber !== null && contact.phoneNumber === self?.phone;
        const matched = contact.phoneNumber
          ? (byPhone.get(contact.phoneNumber) ?? null)
          : null;
        const profile = matched ? toChatPublicProfile(matched) : null;
        return {
          name: contact.name,
          phoneNumber: contact.phoneNumber ?? contact.originalPhoneNumber,
          isRegistered: profile !== null,
          userId: profile?.id ?? null,
          action: profile && !isSelf
            ? ("MESSAGE" as const)
            : contact.phoneNumber && !isSelf
              ? ("INVITE" as const)
              : ("INVALID" as const),
          profile,
        };
      }),
    };
  }

  async createConversation(
    userId: string,
    input: {
      userIds: string[];
      service?: MessagingService | undefined;
      contextId?: string | null | undefined;
      type?: ConversationType | undefined;
      title?: string | null | undefined;
    },
  ) {
    const requested = [...new Set(input.userIds)];
    const type = input.type ?? "DIRECT";
    if (
      requested.includes(userId) &&
      (type !== "DIRECT" || requested.length !== 1)
    ) {
      throw AppError.validation({
        userIds: ["You can only include yourself in a direct conversation"],
      });
    }
    if (requested.length === 0 || requested.length > 99) {
      throw AppError.validation({
        userIds: ["A conversation must include 1 to 99 user IDs"],
      });
    }
    if (type === "DIRECT" && requested.length !== 1) {
      throw AppError.validation({
        userIds: ["Direct conversations require exactly one user ID"],
      });
    }
    if (type === "GROUP" && requested.length < 2) {
      throw AppError.validation({
        userIds: ["Group conversations require at least two other users"],
      });
    }
    const profiles = await this.users.byIds(requested);
    if (profiles.length !== requested.length) {
      throw AppError.validation({
        userIds: ["One or more users are unavailable"],
      });
    }
    const service = input.service ?? DEFAULT_MESSAGING_SERVICE;
    const peerId = type === "DIRECT" ? requested[0]! : requested[0] ?? null;
    const pairKey =
      type === "DIRECT" ? directPairKey(service, userId, peerId!) : null;
    if (pairKey) {
      const existing = await this.chat.findDirectByPairKey(pairKey);
      if (existing) return this.presentConversation(existing);
    }
    const contextId =
      service === "EVENTIS" ? (input.contextId ?? null) : null;
    await this.assertCanStart({
      service,
      source: "CONVERSATION",
      actorId: userId,
      peerId,
      contextId,
      conversationType: type,
      conversationId: null,
    });
    let conversation;
    try {
      conversation = await this.chat.createConversation({
        type,
        service,
        contextId,
        title: type === "GROUP" ? input.title?.trim() || null : null,
        directPairKey: pairKey,
        participantUserIds: [...new Set([userId, ...requested])],
        ...(service === "FINDLOVE" && type === "DIRECT" && peerId !== userId
          ? { connection: { requesterId: userId, recipientId: peerId! } }
          : {}),
      });
    } catch (error) {
      if (pairKey) {
        const existing = await this.chat.findDirectByPairKey(pairKey);
        if (existing) return this.presentConversation(existing);
      }
      throw error;
    }
    return this.presentConversation(conversation);
  }

  async listConversations(
    userId: string,
    input: {
      page: number;
      limit: number;
      archived: boolean;
      service?: MessagingService | undefined;
    },
  ) {
    const result = await this.chat.listConversationsForUser({
      userId,
      service: input.service ?? DEFAULT_MESSAGING_SERVICE,
      archived: input.archived,
      page: input.page,
      limit: input.limit,
    });
    const profiles = await this.users.byIds(
      result.items.flatMap((item) => item.participants.map((p) => p.userId)),
    );
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, toChatPublicProfile(profile)]),
    );
    return {
      items: result.items.map((item) =>
        toConversationResponse(item, profileMap),
      ),
      page: input.page,
      limit: input.limit,
      total: result.total,
    };
  }

  async getConversation(userId: string, conversationId: string) {
    return this.presentConversation(
      await this.requireConversation(userId, conversationId),
    );
  }

  async updateConversationSettings(
    userId: string,
    conversationId: string,
    input: {
      isArchived?: boolean | undefined;
      isMuted?: boolean | undefined;
    },
  ) {
    await this.requireConversation(userId, conversationId);
    await this.chat.updateParticipantSettings({
      conversationId,
      userId,
      ...(input.isArchived !== undefined
        ? { isArchived: input.isArchived }
        : {}),
      ...(input.isMuted !== undefined ? { isMuted: input.isMuted } : {}),
    });
    const updated = await this.chat.findConversationById(conversationId);
    if (!updated) throw AppError.notFound("Conversation");
    return this.presentConversation(updated);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    input: { limit: number; beforeId?: string | undefined },
  ) {
    await this.requireConversation(userId, conversationId);
    if (input.beforeId) {
      const cursor = await this.chat.findMessageById(input.beforeId);
      if (!cursor || cursor.conversationId !== conversationId) {
        throw AppError.validation({
          beforeId: ["Cursor does not belong to this conversation"],
        });
      }
    }
    const participant = (
      await this.chat.findConversationById(conversationId)
    )?.participants.find((item) => item.userId === userId);
    let after: Date | undefined;
    if (participant?.clearedBeforeMessageId) {
      const cleared = await this.chat.findMessageById(
        participant.clearedBeforeMessageId,
      );
      after = cleared?.createdAt;
    }
    const rows = await this.chat.listMessages({
      conversationId,
      limit: input.limit + 1,
      ...(input.beforeId ? { beforeId: input.beforeId } : {}),
      ...(after ? { after } : {}),
    });
    const hasMore = rows.length > input.limit;
    const messages = hasMore ? rows.slice(1) : rows;
    return {
      items: messages.map(toMessageResponse),
      nextBeforeId: hasMore ? (messages[0]?.id ?? null) : null,
      limit: input.limit,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: {
      content: string;
      replyToId?: string | undefined;
      clientMessageId?: string | undefined;
    },
  ) {
    this.rateLimiter.consume(
      `message:${userId}`,
      this.clock.now(),
      MESSAGE_RATE.max,
      MESSAGE_RATE.windowMs,
    );
    const conversation = await this.requireConversation(userId, conversationId);
    const sendFacts = await this.assertCanSend(userId, conversation);
    if (input.replyToId) {
      const reply = await this.chat.findMessageById(input.replyToId);
      if (
        !reply ||
        reply.conversationId !== conversationId ||
        reply.deletedAt
      ) {
        throw AppError.validation({
          replyToId: ["Reply target is unavailable in this conversation"],
        });
      }
    }
    if (input.clientMessageId) {
      const existing = await this.chat.findMessageByClientId(
        userId,
        input.clientMessageId,
      );
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw AppError.conflict(
            ERROR_CODES.VALIDATION_FAILED,
            "clientMessageId was already used for another conversation",
          );
        }
        return toMessageResponse(existing);
      }
    }
    const recipients = conversation.participants
      .filter((p) => p.userId !== userId)
      .map((p) => p.id);
    const now = this.clock.now();
    let message: MessageRecord;
    try {
      message = await this.chat.createMessage({
        conversationId,
        senderId: userId,
        type: "TEXT",
        content: input.content.trim(),
        replyToId: input.replyToId ?? null,
        clientMessageId: input.clientMessageId ?? null,
        recipientParticipantIds: recipients,
        now,
        ...(sendFacts.connection?.status === "PENDING"
          ? { pendingSenderLimit: 1 }
          : {}),
      });
    } catch (error) {
      if (input.clientMessageId && isUniqueConstraintError(error)) {
        const existing = await this.chat.findMessageByClientId(
          userId,
          input.clientMessageId,
        );
        if (existing?.conversationId === conversationId)
          return toMessageResponse(existing);
      }
      throw error;
    }
    this.publishMessage(conversation, message);
    return toMessageResponse(message);
  }

  async editMessage(userId: string, messageId: string, content: string) {
    const message = await this.chat.findMessageById(messageId);
    if (!message) throw AppError.notFound("Message");
    const conversation = await this.requireConversation(
      userId,
      message.conversationId,
    );
    if (message.senderId !== userId) throw AppError.forbidden();
    await this.assertCanSend(userId, conversation);
    if (message.deletedAt)
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Deleted messages cannot be edited",
      );
    if (message.type !== "TEXT")
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Only text messages can be edited",
      );
    const updated = await this.chat.updateMessage({
      id: messageId,
      content: content.trim(),
      editedAt: this.clock.now(),
    });
    this.realtime.emitToUsers(
      conversation.participants.map((p) => p.userId),
      "chat:message:updated",
      { ...toMessageResponse(updated), service: conversation.service },
    );
    return toMessageResponse(updated);
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.chat.findMessageById(messageId);
    if (!message) throw AppError.notFound("Message");
    const conversation = await this.requireConversation(
      userId,
      message.conversationId,
    );
    if (message.senderId !== userId) throw AppError.forbidden();
    await this.assertCanSend(userId, conversation);
    if (!message.deletedAt) {
      const updated = await this.chat.updateMessage({
        id: messageId,
        deletedAt: this.clock.now(),
      });
      this.realtime.emitToUsers(
        conversation.participants.map((p) => p.userId),
        "chat:message:deleted",
        { ...toMessageResponse(updated), service: conversation.service },
      );
    }
    return { id: messageId, deleted: true };
  }

  async markRead(userId: string, conversationId: string) {
    const conversation = await this.requireConversation(userId, conversationId);
    const participant = conversation.participants.find(
      (item) => item.userId === userId,
    )!;
    const at = this.clock.now();
    const updatedCount = await this.chat.markReceipts({
      participantId: participant.id,
      conversationId,
      status: "READ",
      at,
    });
    this.realtime.emitToUsers(
      conversation.participants
        .filter((item) => item.userId !== userId)
        .map((item) => item.userId),
      "chat:receipts:read",
      {
        conversationId,
        userId,
        service: conversation.service,
        readAt: at.toISOString(),
      },
    );
    return { conversationId, readAt: at.toISOString(), updatedCount };
  }

  async markDelivered(
    userId: string,
    conversationId: string,
    messageId?: string,
  ) {
    const conversation = await this.requireConversation(userId, conversationId);
    const participant = conversation.participants.find(
      (item) => item.userId === userId,
    )!;
    if (messageId) {
      const message = await this.chat.findMessageById(messageId);
      if (
        !message ||
        message.conversationId !== conversationId ||
        message.senderId === userId
      ) {
        throw AppError.notFound("Message");
      }
    }
    const at = this.clock.now();
    const updatedCount = await this.chat.markReceipts({
      participantId: participant.id,
      conversationId,
      status: "DELIVERED",
      at,
      ...(messageId ? { messageId } : {}),
    });
    this.realtime.emitToUsers(
      conversation.participants
        .filter((item) => item.userId !== userId)
        .map((item) => item.userId),
      "chat:receipts:delivered",
      {
        conversationId,
        userId,
        service: conversation.service,
        messageId: messageId ?? null,
        deliveredAt: at.toISOString(),
      },
    );
    return { conversationId, deliveredAt: at.toISOString(), updatedCount };
  }

  async addAttachment(
    userId: string,
    conversationId: string,
    file: UploadedFile & {
      content?: string | undefined;
      replyToId?: string | undefined;
      clientMessageId?: string | undefined;
      durationMs?: number | undefined;
      width?: number | undefined;
      height?: number | undefined;
    },
  ) {
    this.rateLimiter.consume(
      `message:${userId}`,
      this.clock.now(),
      MESSAGE_RATE.max,
      MESSAGE_RATE.windowMs,
    );
    const conversation = await this.requireConversation(userId, conversationId);
    const sendFacts = await this.assertCanSend(userId, conversation);
    if (file.replyToId) {
      const reply = await this.chat.findMessageById(file.replyToId);
      if (
        !reply ||
        reply.conversationId !== conversationId ||
        reply.deletedAt
      ) {
        throw AppError.validation({
          replyToId: ["Reply target is unavailable in this conversation"],
        });
      }
    }
    if (file.clientMessageId) {
      const existing = await this.chat.findMessageByClientId(
        userId,
        file.clientMessageId,
      );
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw AppError.conflict(
            ERROR_CODES.VALIDATION_FAILED,
            "clientMessageId was already used for another conversation",
          );
        }
        return toMessageResponse(existing);
      }
    }
    this.storage.validateChatFile(file);
    const type: MessageType = file.mimetype.startsWith("image/")
      ? "IMAGE"
      : file.mimetype.startsWith("audio/")
        ? "VOICE"
        : "FILE";
    const message = await this.chat.createMessage({
      conversationId,
      senderId: userId,
      type,
      content: file.content?.trim() || null,
      replyToId: file.replyToId ?? null,
      clientMessageId: file.clientMessageId ?? null,
      recipientParticipantIds: conversation.participants
        .filter((p) => p.userId !== userId)
        .map((p) => p.id),
      now: this.clock.now(),
      ...(sendFacts.connection?.status === "PENDING"
        ? { pendingSenderLimit: 1 }
        : {}),
    });
    let storageKey: string | undefined;
    try {
      storageKey = await this.storage.uploadChatAttachment(
        conversationId,
        message.id,
        file,
      );
      const attachment = await this.chat.addAttachment({
        messageId: message.id,
        fileName: file.filename.replace(/[\\/]/g, "_").slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.data.length,
        storageKey,
        durationMs: file.durationMs ?? null,
        width: file.width ?? null,
        height: file.height ?? null,
      });
      const result = { ...message, attachments: [attachment] };
      this.publishMessage(conversation, result);
      return toMessageResponse(result);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (storageKey) {
        try {
          await this.storage.deleteFile(storageKey);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        await this.chat.updateMessage({
          id: message.id,
          deletedAt: this.clock.now(),
        });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          "Attachment upload failed and cleanup was incomplete",
          { cause: error },
        );
      }
      throw error;
    }
  }

  async downloadAttachment(userId: string, attachmentId: string) {
    const attachment = await this.chat.findAttachmentById(attachmentId);
    if (!attachment) throw AppError.notFound("Attachment");
    const message = await this.chat.findMessageById(attachment.messageId);
    if (!message || message.deletedAt) throw AppError.notFound("Attachment");
    await this.requireConversation(userId, attachment.conversationId);
    const object = await this.storage.getPrivateObject(attachment.storageKey);
    if (!object) throw AppError.notFound("Attachment");
    return {
      ...object,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async listContactAliases(userId: string) {
    const rows = await this.chat.listContactAliases(userId);
    return {
      items: rows.map((row) => ({
        phone: row.phone,
        contactUserId: row.contactUserId,
        firstName: row.firstName,
        lastName: row.lastName,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async updateContactAlias(
    userId: string,
    input: {
      phoneNumber: string;
      firstName: string;
      lastName?: string | undefined;
      newPhoneNumber?: string | undefined;
    },
  ) {
    const phone = normalizeContactPhone(input.phoneNumber);
    if (!phone) {
      throw AppError.validation({
        phoneNumber: ["Enter a valid phone number"],
      });
    }
    const existing = (await this.chat.listContactAliases(userId)).find(
      (alias) => alias.phone === phone,
    );
    if (!existing) throw AppError.notFound("Contact");
    const nextPhone = input.newPhoneNumber
      ? normalizeContactPhone(input.newPhoneNumber)
      : phone;
    if (!nextPhone) {
      throw AppError.validation({
        newPhoneNumber: ["Enter a valid phone number"],
      });
    }
    const [matched] = await this.users.byPhones([nextPhone]);
    const alias = await this.chat.updateContactAlias(userId, phone, {
      phone: nextPhone,
      contactUserId: matched?.id ?? null,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
    });
    return {
      phone: alias.phone,
      contactUserId: alias.contactUserId,
      firstName: alias.firstName,
      lastName: alias.lastName,
      updatedAt: alias.updatedAt.toISOString(),
    };
  }

  async forwardMessage(
    userId: string,
    messageId: string,
    conversationIds: string[],
  ) {
    const source = await this.chat.findMessageById(messageId);
    if (!source || source.deletedAt) throw AppError.notFound("Message");
    await this.requireConversation(userId, source.conversationId);
    const targets = [...new Set(conversationIds)];
    if (!targets.length || targets.length > 10) {
      throw AppError.validation({
        conversationIds: ["Choose between 1 and 10 conversations"],
      });
    }
    const forwarded = [];
    for (const conversationId of targets) {
      this.rateLimiter.consume(
        `message:${userId}`,
        this.clock.now(),
        MESSAGE_RATE.max,
        MESSAGE_RATE.windowMs,
      );
      const conversation = await this.requireConversation(
        userId,
        conversationId,
      );
      const sendFacts = await this.assertCanSend(userId, conversation);
      let message = await this.chat.createMessage({
        conversationId,
        senderId: userId,
        type: source.type,
        content: source.content,
        replyToId: null,
        clientMessageId: null,
        forwardedFromId: source.id,
        recipientParticipantIds: conversation.participants
          .filter((participant) => participant.userId !== userId)
          .map((participant) => participant.id),
        now: this.clock.now(),
        ...(sendFacts.connection?.status === "PENDING"
          ? { pendingSenderLimit: 1 }
          : {}),
      });
      for (const attachment of source.attachments) {
        await this.chat.addAttachment({
          messageId: message.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          durationMs: attachment.durationMs,
          width: attachment.width,
          height: attachment.height,
        });
      }
      if (source.attachments.length) {
        message =
          (await this.chat.findMessageById(message.id)) ?? message;
      }
      this.publishMessage(conversation, message);
      forwarded.push(toMessageResponse(message));
    }
    return { items: forwarded };
  }

  async clearConversation(userId: string, conversationId: string) {
    await this.requireConversation(userId, conversationId);
    const latest = await this.chat.findLatestMessage(conversationId);
    await this.chat.clearConversation({
      conversationId,
      userId,
      hiddenAt: this.clock.now(),
      clearedBeforeMessageId: latest?.id ?? null,
    });
    return { conversationId, cleared: true };
  }

  async unhideConversation(userId: string, conversationId: string) {
    await this.requireConversation(userId, conversationId);
    await this.chat.unhideConversation({ conversationId, userId });
    return { conversationId, hidden: false };
  }

  async updateAttachmentMetadata(
    userId: string,
    attachmentId: string,
    input: {
      durationMs?: number | null | undefined;
      width?: number | null | undefined;
      height?: number | null | undefined;
    },
  ) {
    const attachment = await this.chat.findAttachmentById(attachmentId);
    if (!attachment) throw AppError.notFound("Attachment");
    const message = await this.chat.findMessageById(attachment.messageId);
    if (!message || message.deletedAt) throw AppError.notFound("Attachment");
    const conversation = await this.requireConversation(
      userId,
      attachment.conversationId,
    );
    if (message.senderId !== userId) throw AppError.forbidden();
    const updated = await this.chat.updateAttachmentMetadata({
      id: attachmentId,
      ...(input.durationMs !== undefined
        ? { durationMs: input.durationMs }
        : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
    });
    if (!updated) throw AppError.notFound("Attachment");
    return {
      ...toAttachmentResponse(updated),
      conversationId: conversation.id,
    };
  }

  async createInvitation(
    userId: string,
    phoneNumber: string,
    service: MessagingService = DEFAULT_MESSAGING_SERVICE,
  ) {
    this.rateLimiter.consume(
      `invite:${userId}`,
      this.clock.now(),
      INVITATION_RATE.max,
      INVITATION_RATE.windowMs,
    );
    const normalized = normalizeContactPhone(phoneNumber);
    if (!normalized)
      throw AppError.validation({
        phoneNumber: ["Enter a valid international phone number"],
      });
    const [profile] = await this.users.byIds([userId]);
    if (!profile) throw AppError.notFound("User");
    if (profile.phone === normalized) {
      throw AppError.validation({
        phoneNumber: ["You cannot invite your own phone number"],
      });
    }
    await this.assertCanStart({
      service,
      source: "INVITE",
      actorId: userId,
      peerId: null,
      contextId: null,
      conversationType: "DIRECT",
      conversationId: null,
    });
    const registered = await this.users.byPhones([normalized]);
    if (registered.length > 0) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This phone number already belongs to a registered user",
      );
    }
    const existing = await this.chat.findPendingInvitation(
      userId,
      normalized,
      this.clock.now(),
    );
    if (existing) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "An invitation is already pending for this phone number",
      );
    }
    const token = generateInvitationToken();
    const invitation = await this.chat.createInvitation({
      inviterId: userId,
      phoneNumber: normalized,
      tokenHash: hashInvitationToken(token, this.env.JWT_REFRESH_SECRET),
      expiresAt: new Date(this.clock.now().getTime() + INVITATION_TTL_MS),
    });
    return toInvitationResponse(
      invitation,
      `${this.env.MOBILE_APP_SCHEME}://invite/${token}`,
    );
  }

  async listInvitations(userId: string) {
    await this.chat.expireInvitations(this.clock.now());
    const invitations = await this.chat.listInvitations(userId);
    return invitations.map((item) =>
      toInvitationResponse(item, `${this.env.MOBILE_APP_SCHEME}://invite`),
    );
  }

  async acceptInvitation(userId: string, token: string) {
    const [profile] = await this.users.byIds([userId]);
    if (!profile) throw AppError.notFound("User");
    const tokenHash = hashInvitationToken(token, this.env.JWT_REFRESH_SECRET);
    const invitation = await this.chat.findInvitationByTokenHash(
      tokenHash,
      this.clock.now(),
    );
    if (!invitation || invitation.phoneNumber !== profile.phone) {
      throw AppError.notFound("Invitation");
    }
    const conversation = await this.getOrCreateDirect(
      DEFAULT_MESSAGING_SERVICE,
      invitation.inviterId,
      userId,
    );
    const accepted = await this.chat.acceptInvitation(
      invitation.id,
      this.clock.now(),
    );
    if (!accepted)
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Invitation has already been used or expired",
      );
    return { invitationId: invitation.id, conversation };
  }

  async createCall(userId: string, conversationId: string, type: CallType) {
    this.rateLimiter.consume(
      `call:${userId}`,
      this.clock.now(),
      CALL_RATE.max,
      CALL_RATE.windowMs,
    );
    const conversation = await this.requireConversation(userId, conversationId);
    await this.assertCanSend(userId, conversation);
    if (conversation.type !== "DIRECT") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Calls are currently supported only in direct conversations",
      );
    }
    const call = await this.chat.createCall({
      conversationId,
      callerId: userId,
      type,
      status: "RINGING",
    });
    this.realtime.emitToUsers(
      conversation.participants
        .filter((p) => p.userId !== userId)
        .map((p) => p.userId),
      "chat:call:incoming",
      { ...toCallResponse(call), service: conversation.service },
    );
    return toCallResponse(call);
  }

  async transitionCall(userId: string, callId: string, status: CallStatus) {
    const call = await this.chat.findCallById(callId);
    if (!call) throw AppError.notFound("Call");
    const conversation = await this.requireConversation(
      userId,
      call.conversationId,
    );
    const isCaller = call.callerId === userId;
    const canAnswer = !isCaller && conversation.type === "DIRECT";
    if (status === "ACCEPTED" || status === "REJECTED" || status === "MISSED") {
      if (!canAnswer) throw AppError.forbidden();
    } else if (!isCaller && status !== "ENDED") {
      throw AppError.forbidden();
    }
    if (
      status === "MISSED" &&
      this.clock.now().getTime() - call.startedAt.getTime() <
        CALL_RING_TIMEOUT_MS
    ) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "A call cannot be marked missed before its ring timeout",
      );
    }
    if (!canTransitionCall(call.status, status)) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Call cannot transition from ${call.status} to ${status}`,
      );
    }
    const at = this.clock.now();
    const updated = await this.chat.updateCall({
      id: callId,
      expectedStatus: call.status,
      status,
      ...(status === "ACCEPTED" ? { answeredAt: at } : {}),
      ...(["ENDED", "REJECTED", "MISSED", "CANCELLED"].includes(status)
        ? { endedAt: at }
        : {}),
    });
    if (!updated) {
      throw AppError.conflict(
        ERROR_CODES.FORBIDDEN,
        "Call state changed; refresh before retrying",
      );
    }
    this.realtime.emitToUsers(
      conversation.participants.map((p) => p.userId),
      "chat:call:updated",
      { ...toCallResponse(updated), service: conversation.service },
    );
    return toCallResponse(updated);
  }

  async listCalls(
    userId: string,
    input: {
      page: number;
      limit: number;
      service?: MessagingService | undefined;
    },
  ) {
    const result = await this.chat.listCallsForUser({
      userId,
      service: input.service ?? DEFAULT_MESSAGING_SERVICE,
      page: input.page,
      limit: input.limit,
    });
    return {
      items: result.items.map(toCallResponse),
      page: input.page,
      limit: input.limit,
      total: result.total,
    };
  }

  async authorizeCallSignal(userId: string, callId: string) {
    const call = await this.chat.findCallById(callId);
    if (!call) throw AppError.notFound("Call");
    if (call.status !== "RINGING" && call.status !== "ACCEPTED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Call signaling is unavailable for this call",
      );
    }
    const conversation = await this.requireConversation(
      userId,
      call.conversationId,
    );
    return {
      service: conversation.service,
      recipientIds: conversation.participants
        .filter((p) => p.userId !== userId)
        .map((p) => p.userId),
    };
  }

  async relayCallSignal(
    userId: string,
    callId: string,
    signal: Record<string, unknown>,
  ) {
    const { recipientIds, service } = await this.authorizeCallSignal(
      userId,
      callId,
    );
    this.realtime.emitToUsers(recipientIds, "chat:call:signal", {
      callId,
      fromUserId: userId,
      service,
      signal,
    });
  }

  async blockUser(userId: string, blockedId: string) {
    if (userId === blockedId) {
      throw AppError.validation({ userId: ["You cannot block yourself"] });
    }
    const profiles = await this.users.byIds([blockedId]);
    if (profiles.length !== 1) throw AppError.notFound("User");
    await this.chat.createBlock(userId, blockedId);
    return { blocked: true, userId: blockedId };
  }

  async unblockUser(userId: string, blockedId: string) {
    if (userId === blockedId) {
      throw AppError.validation({ userId: ["You cannot unblock yourself"] });
    }
    await this.chat.deleteBlock(userId, blockedId);
    return { blocked: false, userId: blockedId };
  }

  async listBlockedUsers(userId: string) {
    const userIds = await this.chat.listBlockedIds(userId);
    return { userIds };
  }

  async reportUser(
    userId: string,
    input: {
      userId: string;
      reason: string;
      conversationId?: string | undefined;
      details?: string | undefined;
    },
  ) {
    if (userId === input.userId) {
      throw AppError.validation({ userId: ["You cannot report yourself"] });
    }
    const profiles = await this.users.byIds([input.userId]);
    if (profiles.length !== 1) throw AppError.notFound("User");
    if (input.conversationId) {
      await this.requireConversation(userId, input.conversationId);
    }
    const report = await this.chat.createReport({
      reporterId: userId,
      reportedUserId: input.userId,
      conversationId: input.conversationId ?? null,
      reason: input.reason,
      details: input.details ?? null,
    });
    return { id: report.id, reported: true };
  }

  async updateConnection(
    userId: string,
    conversationId: string,
    status: "ACCEPTED" | "REJECTED" | "CANCELLED",
  ) {
    const conversation = await this.requireConversation(userId, conversationId);
    if (conversation.service !== "FINDLOVE") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Connection requests exist only on FindLove conversations",
      );
    }
    const updated = await this.chat.updateConnectionStatus({
      conversationId,
      actorId: userId,
      status,
    });
    if (!updated) throw AppError.notFound("Connection request");
    return this.presentConversation(
      (await this.chat.findConversationById(conversationId))!,
    );
  }

  private async getOrCreateDirect(
    service: MessagingService,
    firstUserId: string,
    secondUserId: string,
  ) {
    const key = directPairKey(service, firstUserId, secondUserId);
    const existing = await this.chat.findDirectByPairKey(key);
    if (existing) return this.presentConversation(existing);
    try {
      const created = await this.chat.createConversation({
        type: "DIRECT",
        service,
        contextId: null,
        title: null,
        directPairKey: key,
        participantUserIds: [firstUserId, secondUserId],
      });
      return this.presentConversation(created);
    } catch (error) {
      const raced = await this.chat.findDirectByPairKey(key);
      if (raced) return this.presentConversation(raced);
      throw error;
    }
  }

  private async presentConversation(
    conversation: NonNullable<
      Awaited<ReturnType<ChatRepository["findConversationById"]>>
    >,
  ) {
    const profiles = await this.users.byIds(
      conversation.participants.map((p) => p.userId),
    );
    return toConversationResponse(
      conversation,
      new Map(
        profiles.map((profile) => [profile.id, toChatPublicProfile(profile)]),
      ),
    );
  }

  private async requireConversation(userId: string, conversationId: string) {
    const conversation = await this.chat.findConversationById(conversationId);
    if (!conversation) throw AppError.notFound("Conversation");
    if (
      !conversation.participants.some(
        (participant) => participant.userId === userId,
      )
    ) {
      throw AppError.forbidden();
    }
    return conversation;
  }

  private publishMessage(
    conversation: ConversationRecord,
    message: Parameters<typeof toMessageResponse>[0],
  ) {
    this.realtime.emitToUsers(
      conversation.participants.map((p) => p.userId),
      "chat:message:new",
      { ...toMessageResponse(message), service: conversation.service },
    );
  }

  private async assertCanStart(input: {
    service: MessagingService;
    source: "CONVERSATION" | "INVITE";
    actorId: string;
    peerId: string | null;
    contextId: string | null;
    conversationType: ConversationType;
    conversationId: string | null;
  }) {
    const facts = await this.chat.loadMessagingFacts({
      service: input.service,
      actorId: input.actorId,
      peerId: input.peerId,
      contextId: input.contextId,
      conversationId: input.conversationId,
      now: this.clock.now(),
    });
    assertPolicyAllowed(
      await messagingPolicies[input.service].canStart({
        service: input.service,
        source: input.source,
        actorId: input.actorId,
        peerId: input.peerId ?? input.actorId,
        contextId: input.contextId,
        conversationType: input.conversationType,
        now: this.clock.now(),
        blocked: facts.blocked,
        actor: facts.actor,
        peer: facts.peer,
        connection: facts.connection,
        event: facts.event,
      }),
    );
    return facts;
  }

  private async assertCanSend(userId: string, conversation: ConversationRecord) {
    const peerId =
      conversation.participants.find((item) => item.userId !== userId)?.userId ??
      userId;
    const facts = await this.chat.loadMessagingFacts({
      service: conversation.service,
      actorId: userId,
      peerId,
      contextId: conversation.contextId,
      conversationId: conversation.id,
      now: this.clock.now(),
    });
    assertPolicyAllowed(
      await messagingPolicies[conversation.service].canSend({
        service: conversation.service,
        actorId: userId,
        peerId,
        contextId: conversation.contextId,
        now: this.clock.now(),
        blocked: facts.blocked,
        actor: facts.actor,
        connection: facts.connection,
        event: facts.event,
      }),
    );
    return facts;
  }
}

function splitName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function toChatPublicProfile(profile: PublicUserProfile): ChatPublicProfile {
  const { phone: _phone, ...publicProfile } = profile;
  return publicProfile;
}
