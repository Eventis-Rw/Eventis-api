import { createHmac, randomBytes } from "node:crypto";

import type {
  ConnectionStatus,
  MessagingService,
  PolicyDecision,
  PolicyErrorCode,
} from "./messaging-policy.js";

export type ConversationType = "DIRECT" | "GROUP";
export type MessageType = "TEXT" | "IMAGE" | "FILE" | "VOICE";
export type ReceiptStatus = "SENT" | "DELIVERED" | "READ";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
export type CallType = "VOICE" | "VIDEO";
export type CallStatus =
  | "INITIATED"
  | "RINGING"
  | "ACCEPTED"
  | "REJECTED"
  | "MISSED"
  | "ENDED"
  | "CANCELLED";

export const CONTACT_SYNC_MAX = 5000;
export const CONTACT_SYNC_RATE = { max: 10, windowMs: 60_000 };
export const INVITATION_RATE = { max: 20, windowMs: 60 * 60 * 1000 };
export const MESSAGE_RATE = { max: 60, windowMs: 60_000 };
export const CALL_RATE = { max: 20, windowMs: 60_000 };
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
export const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export function directPairKey(
  service: MessagingService,
  userA: string,
  userB: string,
): string {
  return `${service}:${[userA, userB].sort().join(":")}`;
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function evaluateRateLimit(
  timestamps: number[],
  nowMs: number,
  max: number,
  windowMs: number,
): { limited: boolean; retryAfterSeconds: number; next: number[] } {
  const windowStart = nowMs - windowMs;
  const next = timestamps.filter((stamp) => stamp > windowStart);
  if (next.length >= max) {
    const oldest = next[0] ?? nowMs;
    return {
      limited: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + windowMs - nowMs) / 1000),
      ),
      next,
    };
  }
  next.push(nowMs);
  return { limited: false, retryAfterSeconds: 0, next };
}

const CALL_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  INITIATED: ["RINGING", "CANCELLED", "MISSED"],
  RINGING: ["ACCEPTED", "REJECTED", "MISSED", "CANCELLED"],
  ACCEPTED: ["ENDED"],
  REJECTED: [],
  MISSED: [],
  ENDED: [],
  CANCELLED: [],
};

export function canTransitionCall(from: CallStatus, to: CallStatus): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

export function receiptRank(status: ReceiptStatus): number {
  switch (status) {
    case "SENT":
      return 1;
    case "DELIVERED":
      return 2;
    case "READ":
      return 3;
  }
}

export function canAdvanceReceipt(
  from: ReceiptStatus,
  to: ReceiptStatus,
): boolean {
  return receiptRank(to) >= receiptRank(from);
}

export interface ParticipantRecord {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: Date;
  lastReadAt: Date | null;
  isArchived: boolean;
  isMuted: boolean;
  hiddenAt: Date | null;
  clearedBeforeMessageId: string | null;
}

export interface AttachmentRecord {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface ReceiptRecord {
  id: string;
  messageId: string;
  participantId: string;
  status: ReceiptStatus;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  replyToId: string | null;
  clientMessageId: string | null;
  forwardedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  attachments: AttachmentRecord[];
  receipts: ReceiptRecord[];
}

export interface ConversationRecord {
  id: string;
  type: ConversationType;
  service: MessagingService;
  contextId: string | null;
  title: string | null;
  directPairKey: string | null;
  connectionStatus: ConnectionStatus | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantRecord[];
}

export interface ConversationListItem extends ConversationRecord {
  lastMessage: MessageRecord | null;
  unreadCount: number;
}

export interface InvitationRecord {
  id: string;
  inviterId: string;
  phoneNumber: string;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConnectionRequestRecord {
  id: string;
  requesterId: string;
  recipientId: string;
  conversationId: string;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class PolicyViolationError extends Error {
  constructor(readonly code: PolicyErrorCode) {
    super(code);
    this.name = "PolicyViolationError";
  }
}

export function assertPolicyAllowed(decision: PolicyDecision): void {
  if (!decision.allowed) throw new PolicyViolationError(decision.code);
}

export interface CallRecord {
  id: string;
  conversationId: string;
  callerId: string;
  type: CallType;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
}

export function normalizeContactPhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  const rwanda = /^(\+?250|0)?(7[2389]\d{7})$/.exec(compact);
  if (rwanda) {
    return `+250${rwanda[2]}`;
  }
  if (E164_PHONE.test(compact)) {
    return compact;
  }
  return null;
}
