import { describe, expect, it } from "bun:test";

import {
  canAdvanceReceipt,
  canTransitionCall,
  directPairKey,
  evaluateRateLimit,
  generateInvitationToken,
  hashInvitationToken,
  normalizeContactPhone,
} from "./chat.js";
import { backfillDirectPairKey } from "./messaging-policy.js";

describe("chat domain", () => {
  it("normalizes Rwanda local and international phone numbers", () => {
    expect(normalizeContactPhone("0788 123 456")).toBe("+250788123456");
    expect(normalizeContactPhone("250788123456")).toBe("+250788123456");
    expect(normalizeContactPhone("+447911123456")).toBe("+447911123456");
    expect(normalizeContactPhone("not a phone")).toBeNull();
  });

  it("produces a stable unordered direct conversation key per service", () => {
    expect(directPairKey("FINDLOVE", "user-b", "user-a")).toBe(
      directPairKey("FINDLOVE", "user-a", "user-b"),
    );
    expect(directPairKey("FINDLOVE", "user-a", "user-b")).not.toBe(
      directPairKey("EVENTIS", "user-a", "user-b"),
    );
  });

  it("prefixes legacy pair keys during backfill without rewriting already scoped keys", () => {
    expect(backfillDirectPairKey("a:b", "EVENTIS")).toBe("EVENTIS:a:b");
    expect(backfillDirectPairKey("EVENTIS:a:b", "EVENTIS")).toBe("EVENTIS:a:b");
  });

  it("uses opaque invitation tokens and stores only a keyed digest", () => {
    const token = generateInvitationToken();
    expect(token).toHaveLength(43);
    expect(hashInvitationToken(token, "pepper")).not.toBe(token);
    expect(hashInvitationToken(token, "pepper")).toBe(
      hashInvitationToken(token, "pepper"),
    );
    expect(hashInvitationToken(token, "other-pepper")).not.toBe(
      hashInvitationToken(token, "pepper"),
    );
  });

  it("enforces allowed call transitions", () => {
    expect(canTransitionCall("RINGING", "ACCEPTED")).toBe(true);
    expect(canTransitionCall("ACCEPTED", "ENDED")).toBe(true);
    expect(canTransitionCall("REJECTED", "ACCEPTED")).toBe(false);
  });

  it("does not allow receipts to move backwards", () => {
    expect(canAdvanceReceipt("SENT", "DELIVERED")).toBe(true);
    expect(canAdvanceReceipt("DELIVERED", "READ")).toBe(true);
    expect(canAdvanceReceipt("READ", "DELIVERED")).toBe(false);
  });

  it("limits requests within the configured rolling window", () => {
    const first = evaluateRateLimit([], 10_000, 2, 60_000);
    const second = evaluateRateLimit(first.next, 11_000, 2, 60_000);
    const blocked = evaluateRateLimit(second.next, 12_000, 2, 60_000);
    expect(first.limited).toBe(false);
    expect(second.limited).toBe(false);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBe(58);
  });
});
