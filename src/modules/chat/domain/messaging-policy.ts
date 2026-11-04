export type MessagingService = "FINDLOVE" | "EVENTIS";
export type LoveProfileType = "PRIVATE" | "PUBLIC";
export type ConnectionStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
export type EventLifecycleStatus =
  | "draft"
  | "published"
  | "paused"
  | "cancelled";
export type ConversationStartSource = "CONVERSATION" | "INVITE";

export type PolicyErrorCode =
  | "PROFILE_INCOMPATIBLE"
  | "SUBSCRIPTION_REQUIRED"
  | "PENDING_LIMIT_REACHED"
  | "REQUEST_NOT_ACCEPTED"
  | "BLOCKED"
  | "EVENT_ASSOCIATION_REQUIRED";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; code: PolicyErrorCode };

export const ALLOWED: PolicyDecision = { allowed: true };
export const FINDLOVE_PENDING_MESSAGES_PER_SENDER = 1;
export const DEFAULT_MESSAGING_SERVICE: MessagingService = "EVENTIS";

export function deny(code: PolicyErrorCode): PolicyDecision {
  return { allowed: false, code };
}

export interface PolicyActor {
  profileType: LoveProfileType;
  hasEligibleSubscription: boolean;
  hasPublishingPayment: boolean;
}

export interface ConnectionFacts {
  status: ConnectionStatus;
  requesterId: string;
  recipientId: string;
  messagesSentByActor: number;
}

export interface EventFacts {
  eventId: string;
  posterId: string;
  status: EventLifecycleStatus;
  actorIsRegistered: boolean;
  peerIsRegistered: boolean;
}

export interface StartCtx {
  service: MessagingService;
  source: ConversationStartSource;
  actorId: string;
  peerId: string;
  contextId: string | null;
  conversationType: "DIRECT" | "GROUP";
  now: Date;
  blocked: boolean;
  actor: PolicyActor;
  peer: PolicyActor;
  connection: ConnectionFacts | null;
  event: EventFacts | null;
}

export interface SendCtx {
  service: MessagingService;
  actorId: string;
  peerId: string;
  contextId: string | null;
  now: Date;
  blocked: boolean;
  actor: PolicyActor;
  connection: ConnectionFacts | null;
  event: EventFacts | null;
}

export interface MessagingPolicy {
  canStart(ctx: StartCtx): Promise<PolicyDecision>;
  canSend(ctx: SendCtx): Promise<PolicyDecision>;
}

export const POLICY_MESSAGES: Record<PolicyErrorCode, string> = {
  PROFILE_INCOMPATIBLE: "These profiles cannot message each other",
  SUBSCRIPTION_REQUIRED: "An active subscription is required",
  PENDING_LIMIT_REACHED: "The pending-message limit has been reached",
  REQUEST_NOT_ACCEPTED: "Messaging is not available for this request",
  BLOCKED: "Messaging is blocked between these users",
  EVENT_ASSOCIATION_REQUIRED: "Both people must be associated with this event",
};

export function backfillDirectPairKey(
  key: string,
  service: MessagingService,
): string {
  if (key.startsWith("FINDLOVE:") || key.startsWith("EVENTIS:")) return key;
  return `${service}:${key}`;
}

export function reachedPendingLimit(messagesSentByActor: number): boolean {
  return messagesSentByActor >= FINDLOVE_PENDING_MESSAGES_PER_SENDER;
}
