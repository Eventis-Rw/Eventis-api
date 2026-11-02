import type { PublicUserProfile } from "../../identity/index.js";
import type {
  AttachmentRecord,
  CallRecord,
  ConversationListItem,
  ConversationRecord,
  InvitationRecord,
  MessageRecord,
  ParticipantRecord,
} from "../domain/chat.js";

export interface ParticipantResponse {
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
  isArchived: boolean;
  isMuted: boolean;
  profile: ChatPublicProfile | null;
}

export type ChatPublicProfile = Omit<PublicUserProfile, "phone">;

export interface AttachmentResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  downloadPath: string;
  createdAt: string;
}

export interface ReceiptResponse {
  participantId: string;
  status: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  replyToId: string | null;
  clientMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: AttachmentResponse[];
  receipts: ReceiptResponse[];
}

export interface ConversationResponse {
  id: string;
  type: string;
  service: string;
  contextId: string | null;
  connectionStatus: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage: MessageResponse | null;
  participants: ParticipantResponse[];
}

export interface ContactResponse {
  name: string | null;
  phoneNumber: string;
  isRegistered: boolean;
  userId: string | null;
  action: "MESSAGE" | "INVITE" | "INVALID";
  profile: ChatPublicProfile | null;
}

export interface InvitationResponse {
  id: string;
  phoneNumber: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  shareUrl: string;
}

export interface CallResponse {
  id: string;
  conversationId: string;
  callerId: string;
  type: string;
  status: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export function toAttachmentResponse(
  row: AttachmentRecord,
): AttachmentResponse {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    downloadPath: `/api/v1/chat/attachments/${row.id}/content`,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMessageResponse(row: MessageRecord): MessageResponse {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    content: deleted ? null : row.content,
    replyToId: row.replyToId,
    clientMessageId: row.clientMessageId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    attachments: deleted ? [] : row.attachments.map(toAttachmentResponse),
    receipts: row.receipts.map((receipt) => ({
      participantId: receipt.participantId,
      status: receipt.status,
      deliveredAt: receipt.deliveredAt?.toISOString() ?? null,
      readAt: receipt.readAt?.toISOString() ?? null,
    })),
  };
}

export function toParticipantResponse(
  row: ParticipantRecord,
  profiles: Map<string, ChatPublicProfile>,
): ParticipantResponse {
  return {
    userId: row.userId,
    joinedAt: row.joinedAt.toISOString(),
    lastReadAt: row.lastReadAt?.toISOString() ?? null,
    isArchived: row.isArchived,
    isMuted: row.isMuted,
    profile: profiles.get(row.userId) ?? null,
  };
}

export function toConversationResponse(
  row: ConversationRecord | ConversationListItem,
  profiles: Map<string, ChatPublicProfile>,
  unreadCount = 0,
): ConversationResponse {
  const lastMessage = "lastMessage" in row ? row.lastMessage : null;
  const unread = "unreadCount" in row ? row.unreadCount : unreadCount;
  return {
    id: row.id,
    type: row.type,
    service: row.service,
    contextId: row.contextId,
    connectionStatus: row.connectionStatus,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unreadCount: unread,
    lastMessage: lastMessage ? toMessageResponse(lastMessage) : null,
    participants: row.participants.map((participant) =>
      toParticipantResponse(participant, profiles),
    ),
  };
}

export function toInvitationResponse(
  row: InvitationRecord,
  shareUrl: string,
): InvitationResponse {
  return {
    id: row.id,
    phoneNumber: row.phoneNumber,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    shareUrl,
  };
}

export function toCallResponse(row: CallRecord): CallResponse {
  return {
    id: row.id,
    conversationId: row.conversationId,
    callerId: row.callerId,
    type: row.type,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}
