import { describe, expect, it } from "bun:test";

import {
  generateOtpCode,
  hashOtp,
  hasExceededAttempts,
  isOtpExpired,
  otpMatches,
  OTP_MAX_ATTEMPTS,
  resendCooldownSeconds,
} from "./otp.js";
import { normalizeRwandaPhone, PhoneNormalizationError } from "./phone.js";
import {
  isRefreshReuse,
  isRefreshReusable,
  type RefreshSession,
} from "./user.js";

describe("normalizeRwandaPhone", () => {
  it("normalizes local, national and E.164 forms to +250…", () => {
    expect(normalizeRwandaPhone("0733958012")).toBe("+250733958012");
    expect(normalizeRwandaPhone("250733958012")).toBe("+250733958012");
    expect(normalizeRwandaPhone("+250733958012")).toBe("+250733958012");
    expect(normalizeRwandaPhone("+250 733 958 012")).toBe("+250733958012");
  });

  it("accepts MTN and Airtel prefixes 72/73/78/79", () => {
    expect(normalizeRwandaPhone("+250788123456")).toBe("+250788123456");
    expect(normalizeRwandaPhone("+250729123456")).toBe("+250729123456");
    expect(normalizeRwandaPhone("+250791123456")).toBe("+250791123456");
  });

  it("rejects non-Rwanda numbers", () => {
    expect(() => normalizeRwandaPhone("+254712345678")).toThrow(
      PhoneNormalizationError,
    );
    expect(() => normalizeRwandaPhone("12345")).toThrow(PhoneNormalizationError);
  });
});

describe("OTP crypto", () => {
  it("generates a six-digit code", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hashes and verifies with timing-safe compare", () => {
    const pepper = "test-pepper";
    const code = "123456";
    const hash = hashOtp(code, pepper);
    expect(otpMatches(code, hash, pepper)).toBe(true);
    expect(otpMatches("000000", hash, pepper)).toBe(false);
  });

  it("detects expiry and attempt limits", () => {
    const now = new Date("2026-01-01T12:00:00.000Z");
    const otp = {
      id: "1",
      phone: "+250733958012",
      codeHash: "abc",
      purpose: "SIGN_IN" as const,
      expiresAt: new Date("2026-01-01T11:59:00.000Z"),
      attempts: OTP_MAX_ATTEMPTS,
      verifiedAt: null,
      createdAt: now,
    };
    expect(isOtpExpired(otp, now)).toBe(true);
    expect(hasExceededAttempts(otp)).toBe(true);
  });

  it("computes resend cooldown", () => {
    const created = new Date("2026-01-01T12:00:00.000Z");
    const soon = new Date(created.getTime() + 10_000);
    expect(resendCooldownSeconds(created, soon)).toBe(50);
    expect(resendCooldownSeconds(created, new Date(created.getTime() + 60_000))).toBe(
      0,
    );
  });
});

describe("refresh session rules", () => {
  const base: RefreshSession = {
    id: "s1",
    userId: "u1",
    familyId: "f1",
    tokenHash: "hash",
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    revokedAt: null,
    replacedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("allows a live unused session", () => {
    expect(
      isRefreshReusable(base, new Date("2026-01-15T00:00:00.000Z")),
    ).toBe(true);
  });

  it("detects reuse when replaced", () => {
    expect(isRefreshReuse({ ...base, replacedById: "s2" })).toBe(true);
  });
});
