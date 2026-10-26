import {
  ALLOWED,
  deny,
  reachedPendingLimit,
  type MessagingPolicy,
  type PolicyDecision,
  type SendCtx,
  type StartCtx,
} from "./messaging-policy.js";

function profilesCompatible(ctx: StartCtx): boolean {
  return (
    ctx.actor.profileType === ctx.peer.profileType &&
    (ctx.actor.profileType === "PRIVATE" || ctx.actor.profileType === "PUBLIC")
  );
}

function evaluateStart(ctx: StartCtx): PolicyDecision {
  if (ctx.blocked) return deny("BLOCKED");
  if (ctx.source === "INVITE") return deny("REQUEST_NOT_ACCEPTED");
  if (ctx.conversationType !== "DIRECT") return deny("PROFILE_INCOMPATIBLE");
  if (!profilesCompatible(ctx)) return deny("PROFILE_INCOMPATIBLE");
  const status = ctx.connection?.status;
  if (status === "REJECTED" || status === "CANCELLED") {
    return deny("REQUEST_NOT_ACCEPTED");
  }
  if (status === "ACCEPTED" || status === "PENDING") return ALLOWED;
  if (!ctx.actor.hasEligibleSubscription) return deny("SUBSCRIPTION_REQUIRED");
  return ALLOWED;
}

function evaluateSend(ctx: SendCtx): PolicyDecision {
  if (ctx.blocked) return deny("BLOCKED");
  if (!ctx.connection || ctx.connection.status === "REJECTED" || ctx.connection.status === "CANCELLED") {
    return deny("REQUEST_NOT_ACCEPTED");
  }
  if (ctx.connection.status === "ACCEPTED") return ALLOWED;
  if (reachedPendingLimit(ctx.connection.messagesSentByActor)) {
    return deny("PENDING_LIMIT_REACHED");
  }
  return ALLOWED;
}

export const findLovePolicy: MessagingPolicy = {
  canStart: (ctx) => Promise.resolve(evaluateStart(ctx)),
  canSend: (ctx) => Promise.resolve(evaluateSend(ctx)),
};
