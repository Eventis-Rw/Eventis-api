import {
  ALLOWED,
  deny,
  type EventLifecycleStatus,
  type MessagingPolicy,
  type PolicyDecision,
  type SendCtx,
  type StartCtx,
} from "./messaging-policy.js";

export type EventisRole = "ORGANIZER" | "ATTENDEE";

export interface EventisMessagingConfig {
  canInitiate: EventisRole[];
  canReply: EventisRole[];
  requireEventAssociation: boolean;
  requireSubscription: boolean;
  requirePublishingPayment: boolean;
  allowCreateWhenEventStatus: EventLifecycleStatus[];
  allowContinueWhenEventStatus: EventLifecycleStatus[];
  allowPhoneInvites: boolean;
  allowGroupsWithoutEvent: boolean;
}

export const EVENTIS_MESSAGING_CONFIG: EventisMessagingConfig = {
  canInitiate: ["ORGANIZER"],
  canReply: ["ORGANIZER", "ATTENDEE"],
  requireEventAssociation: true,
  requireSubscription: false,
  requirePublishingPayment: false,
  allowCreateWhenEventStatus: ["published"],
  allowContinueWhenEventStatus: ["draft", "published", "cancelled"],
  allowPhoneInvites: true,
  allowGroupsWithoutEvent: true,
};

function roleOf(userId: string, registered: boolean, event: StartCtx["event"]): EventisRole | null {
  if (!event) return null;
  if (event.posterId === userId) return "ORGANIZER";
  if (registered) return "ATTENDEE";
  return null;
}

function evaluateStart(ctx: StartCtx, config: EventisMessagingConfig): PolicyDecision {
  if (ctx.blocked) return deny("BLOCKED");
  if (ctx.source === "INVITE" && config.allowPhoneInvites) return ALLOWED;
  if (ctx.conversationType === "GROUP" && config.allowGroupsWithoutEvent && !ctx.contextId) {
    return ALLOWED;
  }
  if (config.requireSubscription && !ctx.actor.hasEligibleSubscription) {
    return deny("SUBSCRIPTION_REQUIRED");
  }
  if (config.requirePublishingPayment && !ctx.actor.hasPublishingPayment) {
    return deny("SUBSCRIPTION_REQUIRED");
  }
  if (!config.requireEventAssociation) return ALLOWED;
  if (!ctx.event || ctx.contextId !== ctx.event.eventId) {
    return deny("EVENT_ASSOCIATION_REQUIRED");
  }
  if (!config.allowCreateWhenEventStatus.includes(ctx.event.status)) {
    return deny("EVENT_ASSOCIATION_REQUIRED");
  }
  const actorRole = roleOf(ctx.actorId, ctx.event.actorIsRegistered, ctx.event);
  const peerRole = roleOf(ctx.peerId, ctx.event.peerIsRegistered, ctx.event);
  if (!actorRole || !peerRole) return deny("EVENT_ASSOCIATION_REQUIRED");
  if (!config.canInitiate.includes(actorRole)) return deny("EVENT_ASSOCIATION_REQUIRED");
  return ALLOWED;
}

function evaluateSend(ctx: SendCtx, config: EventisMessagingConfig): PolicyDecision {
  if (ctx.blocked) return deny("BLOCKED");
  if (!config.requireEventAssociation) return ALLOWED;
  if (!ctx.contextId) return ALLOWED;
  if (!ctx.event) return deny("EVENT_ASSOCIATION_REQUIRED");
  if (!config.allowContinueWhenEventStatus.includes(ctx.event.status)) {
    return deny("EVENT_ASSOCIATION_REQUIRED");
  }
  const actorRole = roleOf(ctx.actorId, ctx.event.actorIsRegistered, ctx.event);
  if (!actorRole || !config.canReply.includes(actorRole)) {
    return deny("EVENT_ASSOCIATION_REQUIRED");
  }
  return ALLOWED;
}

export function createEventisPolicy(
  config: EventisMessagingConfig = EVENTIS_MESSAGING_CONFIG,
): MessagingPolicy {
  return {
    canStart: (ctx) => Promise.resolve(evaluateStart(ctx, config)),
    canSend: (ctx) => Promise.resolve(evaluateSend(ctx, config)),
  };
}

export const eventisPolicy = createEventisPolicy();
