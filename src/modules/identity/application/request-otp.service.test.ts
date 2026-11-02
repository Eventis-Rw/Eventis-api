import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import type { OtpRecord } from "../domain/otp.js";
import type { OtpRepository, UserRepository } from "../infrastructure/identity.repository.js";
import type { SmsProvider } from "../infrastructure/sms/sms-provider.js";
import type { TokenService } from "../infrastructure/token.service.js";

import { RequestOtpService } from "./request-otp.service.js";

const now = new Date("2026-10-09T12:00:00.000Z");
const phone = "+250733958012";

function otp(purpose: OtpRecord["purpose"], options: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: "otp-1",
    phone,
    codeHash: "hash",
    purpose,
    firstName: null,
    accountType: null,
    expiresAt: new Date(now.getTime() - 60_000),
    attempts: 0,
    verifiedAt: null,
    createdAt: new Date(now.getTime() - 86_400_000),
    ...options,
  };
}

function serviceFor(latestOtp: OtpRecord | null) {
  let created: { purpose: string; firstName?: string; accountType?: string } | undefined;
  const otpRepository = {
    findLatestAny: (_phone: string, purpose?: OtpRecord["purpose"]) =>
      Promise.resolve(purpose ? (purpose === latestOtp?.purpose ? latestOtp : null) : latestOtp),
    countSince: () => Promise.resolve(0),
    create: (input: typeof created) => {
      created = input;
      return Promise.resolve(undefined);
    },
  } as unknown as OtpRepository;
  const users = { findByPhone: () => Promise.resolve(null) } as unknown as UserRepository;
  const tokens = {
    hashOtpCode: () => "hashed-code",
    hashPin: () => "hashed-pin",
  } as unknown as TokenService;
  const sms = { send: () => Promise.resolve() } as SmsProvider;
  const service = new RequestOtpService(
    otpRepository,
    users,
    tokens,
    sms,
    new FixedClock(now),
  );
  return { service, created: () => created };
}

describe("RequestOtpService signup identity", () => {
  it("does not compare a prior sign-in OTP with new signup details", async () => {
    const { service, created } = serviceFor(otp("SIGN_IN"));

    await service.execute({ phone, firstName: "flaman", accountType: "CUSTOMER", pin: "12345" });

    expect(created()).toMatchObject({
      purpose: "SIGN_UP",
      firstName: "flaman",
      accountType: "CUSTOMER",
    });
  });

  it("still rejects changed details for an active signup", async () => {
    const pendingSignup = otp("SIGN_UP", {
      firstName: "Another name",
      accountType: "CUSTOMER",
      createdAt: new Date(now.getTime() - 30_000),
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const { service } = serviceFor(pendingSignup);

    try {
      await service.execute({ phone, firstName: "flaman", accountType: "CUSTOMER", pin: "12345" });
      throw new Error("Expected the identity mismatch to be rejected");
    } catch (error) {
      expect(error).toMatchObject({
        status: 409,
        message: "This signup request does not match the current phone identity",
      });
    }
  });
});
