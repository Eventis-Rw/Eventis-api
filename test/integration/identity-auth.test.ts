/**
 * Integration tests for the identity auth flow.
 *
 * Requires Postgres (docker compose). Uses SMS_PROVIDER=fake so no SMS leaves
 * the process — FakeSmsProvider exposes the OTP for assertions only.
 *
 * Providers are wired explicitly (not via IdentityModule) to avoid loading the
 * platform HealthController under bun's test runner decorator quirks.
 */
import "reflect-metadata";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { ERROR_CODES } from "@eventis/contracts";

import { FixedClock } from "../../src/common/clock.js";
import { type AppError } from "../../src/common/errors/app-error.js";
import { loadEnv } from "../../src/config/env.js";
import { PrismaService } from "../../src/infrastructure/database/prisma.service.js";
import { GetMeService } from "../../src/modules/identity/application/get-me.service.js";
import { LoginService } from "../../src/modules/identity/application/login.service.js";
import { LogoutService } from "../../src/modules/identity/application/logout.service.js";
import { RefreshTokenService } from "../../src/modules/identity/application/refresh-token.service.js";
import { RequestOtpService } from "../../src/modules/identity/application/request-otp.service.js";
import { UpdateProfileService } from "../../src/modules/identity/application/update-profile.service.js";
import { VerifyOtpService } from "../../src/modules/identity/application/verify-otp.service.js";
import {
  OtpRepository,
  RefreshSessionRepository,
  UserRepository,
} from "../../src/modules/identity/infrastructure/identity.repository.js";
import { FakeSmsProvider } from "../../src/modules/identity/infrastructure/sms/fake-sms.provider.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";

const PHONE = "+250788111222";
const DEVICE_A = "device-install-aaaa-bbbb";
const DEVICE_B = "device-install-cccc-dddd";

describe("identity auth integration", () => {
  let prisma: PrismaService;
  let requestOtp: RequestOtpService;
  let verifyOtp: VerifyOtpService;
  let refresh: RefreshTokenService;
  let logout: LogoutService;
  let getMe: GetMeService;
  let login: LoginService;
  let updateProfile: UpdateProfileService;
  let fakeSms: FakeSmsProvider;
  let tokens: TokenService;
  let clock: FixedClock;
  beforeAll(async () => {
    process.env.SMS_PROVIDER = "fake";
    process.env.NODE_ENV ??= "test";
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/eventis_test";
    process.env.REDIS_URL ??= "redis://localhost:6379";
    process.env.JWT_ACCESS_SECRET ??= "a".repeat(32);
    process.env.JWT_REFRESH_SECRET ??= "b".repeat(32);
    process.env.TICKET_SIGNING_PRIVATE_KEY ??= "priv";
    process.env.TICKET_SIGNING_PUBLIC_KEY ??= "pub";
    process.env.STORAGE_ENDPOINT ??= "http://localhost:9000";
    process.env.STORAGE_BUCKET ??= "eventis-dev";
    process.env.STORAGE_ACCESS_KEY_ID ??= "key";
    process.env.STORAGE_SECRET_ACCESS_KEY ??= "secret";

    clock = new FixedClock(new Date());
    prisma = new PrismaService();
    await prisma.$connect();

    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      TICKET_SIGNING_PRIVATE_KEY: process.env.TICKET_SIGNING_PRIVATE_KEY,
      TICKET_SIGNING_PUBLIC_KEY: process.env.TICKET_SIGNING_PUBLIC_KEY,
      STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
      STORAGE_BUCKET: process.env.STORAGE_BUCKET,
      STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
      STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
      SMS_PROVIDER: "fake",
    });

    fakeSms = new FakeSmsProvider();
    tokens = new TokenService(env, clock);
    const otpRepo = new OtpRepository(prisma);
    const userRepo = new UserRepository(prisma);
    const sessionRepo = new RefreshSessionRepository(prisma);

    requestOtp = new RequestOtpService(
      otpRepo,
      userRepo,
      tokens,
      fakeSms,
      clock,
    );
    verifyOtp = new VerifyOtpService(otpRepo, userRepo, tokens, clock);
    refresh = new RefreshTokenService(sessionRepo, userRepo, tokens, clock);
    logout = new LogoutService(sessionRepo, tokens, clock);
    getMe = new GetMeService(userRepo);
    login = new LoginService(userRepo, tokens, clock);
    updateProfile = new UpdateProfileService(userRepo);
  });

  beforeEach(async () => {
    fakeSms.clear();
    await prisma.refreshSession.deleteMany({});
    await prisma.userDevice.deleteMany({});
    await prisma.otpVerification.deleteMany({});
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    clock.set(new Date());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function requestAndReadCode(deviceId = DEVICE_A): Promise<string> {
    await requestOtp.execute({ phone: PHONE, deviceId });
    const code = fakeSms.lastOtpCode();
    expect(code).toMatch(/^\d{6}$/);
    return code!;
  }

  it("completes request → verify → me", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });

    expect(session.user.phone).toBe(PHONE);
    expect(session.deviceCredential).toBeDefined();
    expect(session.tokens.accessToken).toBeTruthy();

    const claims = await tokens.verifyAccessToken(session.tokens.accessToken);
    const me = await getMe.execute(claims.sub);
    expect(me.id).toBe(session.user.id);
    expect(me.phone).toBe(PHONE);
  });

  it("does not create a duplicate user on second verify", async () => {
    const code1 = await requestAndReadCode();
    const first = await verifyOtp.execute({
      phone: PHONE,
      code: code1,
      deviceId: DEVICE_A,
    });

    clock.advanceMs(61_000);
    const code2 = await requestAndReadCode();
    const second = await verifyOtp.execute({
      phone: PHONE,
      code: code2,
      deviceId: DEVICE_A,
      deviceCredential: first.deviceCredential,
    });

    expect(second.user.id).toBe(first.user.id);
    expect(second.deviceCredential).toBeUndefined();
    const users = await prisma.user.count({ where: { phone: PHONE } });
    expect(users).toBe(1);
  });

  it("rejects invalid OTP", async () => {
    await requestAndReadCode();
    try {
      await verifyOtp.execute({
        phone: PHONE,
        code: "000000",
        deviceId: DEVICE_A,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.OTP_INVALID);
    }
  });

  it("completes signup with the requested name and account type", async () => {
    await requestOtp.execute({
      phone: PHONE,
      deviceId: DEVICE_A,
      firstName: "Jordan",
      accountType: "POSTER",
    });
    const code = fakeSms.lastOtpCode();
    expect(code).toMatch(/^\d{6}$/);

    const session = await verifyOtp.execute(
      { phone: PHONE, code: code!, deviceId: DEVICE_A },
      "SIGN_UP",
    );
    const stored = await prisma.user.findUnique({ where: { phone: PHONE } });

    expect(session.user.firstName).toBe("Jordan");
    expect(session.user.accountType).toBe("POSTER");
    expect(stored?.firstName).toBe("Jordan");
    expect(stored?.accountType).toBe("POSTER");
    expect(
      await prisma.userDevice.count({ where: { userId: stored!.id } }),
    ).toBe(1);
  });

  it("rejects duplicate signup before sending another code", async () => {
    const first = await requestAndReadCode();
    await verifyOtp.execute({ phone: PHONE, code: first, deviceId: DEVICE_A });
    try {
      await requestOtp.execute({
        phone: PHONE,
        deviceId: DEVICE_A,
        firstName: "Jordan",
        accountType: "LOVE",
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).status).toBe(409);
    }
  });

  it("rejects signup number changes for the same phone and device while a signup OTP is active", async () => {
    await requestOtp.execute({
      phone: PHONE,
      deviceId: DEVICE_A,
      firstName: "Aline",
      accountType: "LOVE",
    });

    try {
      await requestOtp.execute({
        phone: PHONE,
        deviceId: DEVICE_A,
        firstName: "AnotherName",
        accountType: "LOVE",
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).status).toBe(409);
    }
  });

  it("allows login only with the registered device credential", async () => {
    const code = await requestAndReadCode();
    const signup = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });
    const authenticated = await login.execute({
      phone: PHONE,
      deviceId: DEVICE_A,
      deviceCredential: signup.deviceCredential!,
    });
    expect(authenticated.user.id).toBe(signup.user.id);
    expect(authenticated.deviceCredential).toBeUndefined();

    try {
      await login.execute({
        phone: PHONE,
        deviceId: DEVICE_B,
        deviceCredential: signup.deviceCredential!,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).status).toBe(401);
    }
  });

  it("updates only allowed profile fields for the authenticated user", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });
    const profile = await updateProfile.execute(session.user.id, {
      lastName: "Doe",
      bio: "Event creator",
      location: "Kigali",
    });
    expect(profile.lastName).toBe("Doe");
    expect(profile.bio).toBe("Event creator");
    expect(profile.location).toBe("Kigali");
    expect(profile).not.toHaveProperty("credentialHash");
  });

  it("updates displayName and avatarUrl fields", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });
    const profile = await updateProfile.execute(session.user.id, {
      displayName: "Jordan Creator",
      avatarUrl: "https://example.com/avatars/user-123.jpg",
      email: "user@example.com",
      gender: "Other",
      interestedIn: "tech",
      organizationName: "Tech Hub",
    });
    expect(profile.displayName).toBe("Jordan Creator");
    expect(profile.avatarUrl).toBe("https://example.com/avatars/user-123.jpg");
    expect(profile.email).toBe("user@example.com");
    expect(profile.gender).toBe("Other");
    expect(profile.interestedIn).toBe("tech");
    expect(profile.organizationName).toBe("Tech Hub");
  });

  it("persists a complete profile payload", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });
    const payload = {
      firstName: "Aline",
      lastName: "Uwase",
      displayName: "irakoze",
      email: null,
      accountType: "LOVE",
      avatarUrl: null,
      organizationName: null,
      organizationDescription: null,
      dateOfBirth: null,
      gender: null,
      bio: null,
      location: "Kigali",
      interestedIn: null,
    } as const;

    const profile = await updateProfile.execute(session.user.id, payload);
    const stored = await prisma.user.findUnique({ where: { phone: PHONE } });

    expect(profile.firstName).toBe(payload.firstName);
    expect(profile.lastName).toBe(payload.lastName);
    expect(profile.displayName).toBe(payload.displayName);
    expect(profile.accountType).toBe(payload.accountType);
    expect(profile.location).toBe(payload.location);

    expect(stored?.firstName).toBe(payload.firstName);
    expect(stored?.lastName).toBe(payload.lastName);
    expect(stored?.displayName).toBe(payload.displayName);
    expect(stored?.accountType).toBe(payload.accountType);
    expect(stored?.location).toBe(payload.location);
  });

  it("partial PATCH preserves existing fields", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });

    await updateProfile.execute(session.user.id, {
      firstName: "Aline",
      lastName: "Uwase",
      displayName: "irakoze",
      accountType: "LOVE",
      location: "Kigali",
    } as any);

    const updated = await updateProfile.execute(session.user.id, {
      displayName: "New Name",
    });
    const stored = await prisma.user.findUnique({ where: { phone: PHONE } });

    expect(updated.displayName).toBe("New Name");

    expect(updated.firstName).toBe("Aline");
    expect(updated.lastName).toBe("Uwase");
    expect(updated.accountType).toBe("LOVE");
    expect(stored?.displayName).toBe("New Name");
    expect(stored?.firstName).toBe("Aline");
    expect(stored?.lastName).toBe("Uwase");
  });

  it("rejects expired OTP", async () => {
    const code = await requestAndReadCode();
    clock.advanceMs(6 * 60 * 1000);
    try {
      await verifyOtp.execute({
        phone: PHONE,
        code,
        deviceId: DEVICE_A,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.OTP_EXPIRED);
    }
  });

  it("rejects reused OTP", async () => {
    const code = await requestAndReadCode();
    await verifyOtp.execute({ phone: PHONE, code, deviceId: DEVICE_A });
    try {
      await verifyOtp.execute({ phone: PHONE, code, deviceId: DEVICE_A });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.OTP_INVALID);
    }
  });

  it("enforces OTP attempt limits", async () => {
    await requestAndReadCode();
    for (let i = 0; i < 5; i++) {
      try {
        await verifyOtp.execute({
          phone: PHONE,
          code: "111111",
          deviceId: DEVICE_A,
        });
      } catch {
        // Expected for an invalid or expired device credential.
      }
    }
    try {
      await verifyOtp.execute({
        phone: PHONE,
        code: "111111",
        deviceId: DEVICE_A,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.OTP_TOO_MANY_ATTEMPTS);
    }
  });

  it("throttles OTP resend", async () => {
    await requestAndReadCode();
    try {
      await requestOtp.execute({ phone: PHONE, deviceId: DEVICE_A });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.OTP_SEND_THROTTLED);
    }
  });

  it("rejects a second device without replacing the first", async () => {
    const code = await requestAndReadCode();
    const first = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });

    clock.advanceMs(61_000);
    const code2 = await requestAndReadCode(DEVICE_B);
    try {
      await verifyOtp.execute({
        phone: PHONE,
        code: code2,
        deviceId: DEVICE_B,
        deviceCredential: first.deviceCredential,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.FORBIDDEN);
    }

    const devices = await prisma.userDevice.findMany({
      where: { user: { phone: PHONE } },
    });
    expect(devices).toHaveLength(1);
    expect(devices[0]?.deviceId).toBe(DEVICE_A);
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });

    const rotated = await refresh.execute({
      refreshToken: session.tokens.refreshToken,
    });
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(session.tokens.refreshToken);

    try {
      await refresh.execute({ refreshToken: session.tokens.refreshToken });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.TOKEN_REUSE_DETECTED);
    }
  });

  it("logout revokes the refresh family", async () => {
    const code = await requestAndReadCode();
    const session = await verifyOtp.execute({
      phone: PHONE,
      code,
      deviceId: DEVICE_A,
    });

    await logout.execute({ refreshToken: session.tokens.refreshToken });

    try {
      await refresh.execute({ refreshToken: session.tokens.refreshToken });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.TOKEN_REUSE_DETECTED);
    }
  });
});
