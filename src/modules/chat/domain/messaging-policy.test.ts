import { describe, expect, it } from "bun:test";

import { createEventisPolicy } from "./eventis.policy.js";
import { findLovePolicy } from "./findlove.policy.js";
import {
  ALLOWED,
  type SendCtx,
  type StartCtx,
} from "./messaging-policy.js";
import { messagingPolicies } from "./policies.js";

const actor = {
  profileType: "PRIVATE" as const,
  hasEligibleSubscription: true,
  hasPublishingPayment: false,
};

function startCtx(overrides: Partial<StartCtx> = {}): StartCtx {
  return {
    service: "FINDLOVE",
    source: "CONVERSATION",
    actorId: "sender",
    peerId: "recipient",
    contextId: null,
    conversationType: "DIRECT",
    now: new Date("2026-01-01T00:00:00Z"),
    blocked: false,
    actor,
    peer: actor,
    connection: null,
    event: null,
    ...overrides,
  };
}

function sendCtx(overrides: Partial<SendCtx> = {}): SendCtx {
  return {
    service: "FINDLOVE",
    actorId: "sender",
    peerId: "recipient",
    contextId: null,
    now: new Date("2026-01-01T00:00:00Z"),
    blocked: false,
    actor,
    connection: {
      status: "PENDING",
      requesterId: "sender",
      recipientId: "recipient",
      messagesSentByActor: 0,
    },
    event: null,
    ...overrides,
  };
}

describe("messaging policies", () => {
  it("resolves both services to the shared policy interface", () => {
    expect(Object.keys(messagingPolicies).sort()).toEqual([
      "EVENTIS",
      "FINDLOVE",
    ]);
  });

  it("allows matching FindLove profile types and rejects cross-type pairs", async () => {
    expect(await findLovePolicy.canStart(startCtx())).toEqual(ALLOWED);
    expect(
      await findLovePolicy.canStart(
        startCtx({ peer: { ...actor, profileType: "PUBLIC" } }),
      ),
    ).toEqual({ allowed: false, code: "PROFILE_INCOMPATIBLE" });
  });

  it("requires a FindLove subscription only for a new request", async () => {
    expect(
      await findLovePolicy.canStart(
        startCtx({ actor: { ...actor, hasEligibleSubscription: false } }),
      ),
    ).toEqual({ allowed: false, code: "SUBSCRIPTION_REQUIRED" });
    expect(
      await findLovePolicy.canSend(
        sendCtx({
          actor: { ...actor, hasEligibleSubscription: false },
          connection: {
            status: "ACCEPTED",
            requesterId: "sender",
            recipientId: "recipient",
            messagesSentByActor: 4,
          },
        }),
      ),
    ).toEqual(ALLOWED);
  });

  it("limits each side to one pending message and closes rejected requests", async () => {
    expect(await findLovePolicy.canSend(sendCtx())).toEqual(ALLOWED);
    expect(
      await findLovePolicy.canSend(
        sendCtx({
          connection: {
            status: "PENDING",
            requesterId: "sender",
            recipientId: "recipient",
            messagesSentByActor: 1,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "PENDING_LIMIT_REACHED" });
    expect(
      await findLovePolicy.canSend(
        sendCtx({
          connection: {
            status: "REJECTED",
            requesterId: "sender",
            recipientId: "recipient",
            messagesSentByActor: 0,
          },
        }),
      ),
    ).toEqual({ allowed: false, code: "REQUEST_NOT_ACCEPTED" });
  });

  it("rejects blocked participants for both services", async () => {
    expect(await findLovePolicy.canSend(sendCtx({ blocked: true }))).toEqual({
      allowed: false,
      code: "BLOCKED",
    });
    expect(
      await messagingPolicies.EVENTIS.canStart(
        startCtx({ service: "EVENTIS", blocked: true }),
      ),
    ).toEqual({ allowed: false, code: "BLOCKED" });
  });

  it("allows open Eventis chat without an event association", async () => {
    expect(
      await messagingPolicies.EVENTIS.canStart(
        startCtx({ service: "EVENTIS", contextId: "event-id", event: null }),
      ),
    ).toEqual(ALLOWED);
    expect(
      await messagingPolicies.EVENTIS.canSend(
        sendCtx({ service: "EVENTIS", contextId: "event-id", event: null }),
      ),
    ).toEqual(ALLOWED);
  });

  it("keeps Eventis access independent from FindLove subscriptions", async () => {
    const policy = createEventisPolicy({
      canInitiate: ["ORGANIZER"],
      canReply: ["ORGANIZER", "ATTENDEE"],
      requireEventAssociation: true,
      requireSubscription: true,
      requirePublishingPayment: false,
      allowCreateWhenEventStatus: ["published"],
      allowContinueWhenEventStatus: ["published"],
      allowPhoneInvites: false,
      allowGroupsWithoutEvent: false,
    });
    const context = startCtx({
      service: "EVENTIS",
      contextId: "event-id",
      actor: { ...actor, hasEligibleSubscription: true },
      event: {
        eventId: "event-id",
        posterId: "sender",
        status: "published",
        actorIsRegistered: false,
        peerIsRegistered: true,
      },
    });
    expect(await policy.canStart(context)).toEqual(ALLOWED);
    expect(
      await policy.canStart({
        ...context,
        actor: { ...actor, hasEligibleSubscription: false },
      }),
    ).toEqual({ allowed: false, code: "SUBSCRIPTION_REQUIRED" });
  });
});
