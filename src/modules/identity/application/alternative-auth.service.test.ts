import assert from "node:assert/strict";

import { ERROR_CODES } from "@eventis/contracts";
import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { loadEnv } from "../../../config/env.js";
import { EmailService } from "../../../infrastructure/email/email.service.js";
import { FakeEmailProvider } from "../../../infrastructure/email/fake-email.provider.js";
import { TokenService } from "../infrastructure/token.service.js";

import { AlternativeAuthService } from "./alternative-auth.service.js";

const noopQueue = { enqueue: () => Promise.resolve() } as never;

const now = new Date("2026-11-20T10:00:00Z");
const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/eventis",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  TICKET_SIGNING_PRIVATE_KEY: "priv",
  TICKET_SIGNING_PUBLIC_KEY: "pub",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "test",
  STORAGE_ACCESS_KEY_ID: "key",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  BREVO_API_KEY: "test-email-key",
  AUTH_EMAIL_FROM: "Eventis <auth@example.com>",
  GOOGLE_AUTH_CLIENT_IDS: "test-client-id",
});

function fixture(
  overrides: Record<string, unknown> = {},
  envOverrides: Partial<typeof env> = {},
  emailProvider: FakeEmailProvider = new FakeEmailProvider(),
) {
  const tokens = new TokenService(env, new FixedClock(now));
  const emails = new EmailService(emailProvider as never, noopQueue);
  const challenge = {
    id: "challenge-id",
    email: "aline@example.com",
    purpose: "register",
    username: "Aline",
    attempts: 0,
    codeHash: tokens.hashOtpCode("123456"),
    consumedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + 300_000),
    ...overrides,
  };
  let account: Record<string, unknown> | null = null;
  let sessions = 0;
  const tx = {
    $queryRaw: () => Promise.resolve([]),
    emailSignInCode: {
      findFirst: () => Promise.resolve(null),
      count: () => Promise.resolve(0),
      updateMany: () => Promise.resolve({ count: 0 }),
      create: ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(challenge, data);
        return Promise.resolve(challenge);
      },
      findUnique: () => Promise.resolve(challenge),
      update: ({
        data,
      }: {
        data: { attempts?: unknown; consumedAt?: Date };
      }) => {
        if (data.attempts) challenge.attempts++;
        if (data.consumedAt) challenge.consumedAt = data.consumedAt;
        return Promise.resolve(challenge);
      },
    },
    user: {
      findUnique: () => Promise.resolve(account),
      findFirst: () => Promise.resolve(account),
      create: ({ data }: { data: Record<string, unknown> }) => {
        account = {
          ...data,
          id: "user-id",
          phone: "",
          status: "ACTIVE",
          role: "CUSTOMER",
          createdAt: now,
          deletedAt: null,
        };
        return Promise.resolve(account);
      },
    },
  };
  const prisma = {
    emailSignInCode: tx.emailSignInCode,
    $transaction: (fn: (db: typeof tx) => unknown) => Promise.resolve(fn(tx)),
  };
  const users = {
    findById: () => Promise.resolve(account),
    createLoginSession: () => {
      sessions++;
      return Promise.resolve();
    },
  };
  const service = new AlternativeAuthService(
    prisma as never,
    users as never,
    tokens,
    new FixedClock(now),
    emails,
    { ...env, ...envOverrides },
  );
  return {
    service,
    challenge,
    emailProvider,
    getAccount: () => account,
    setAccount: (value: Record<string, unknown>) => {
      account = value;
    },
    getSessions: () => sessions,
  };
}

describe("AlternativeAuthService", () => {
  it("registers only after email proof and issues a normal Eventis session without a phone", async () => {
    const f = fixture();
    const result = await f.service.verifyEmailCode({
      email: "ALINE@example.com",
      challengeId: "challenge-id",
      code: "123456",
    });
    expect(result.user.email).toBe("aline@example.com");
    expect(result.user.isPhoneVerified).toBe(false);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(f.getSessions()).toBe(1);
    expect(f.challenge.consumedAt).toEqual(now);
    await assert.rejects(
      f.service.verifyEmailCode({
        email: "aline@example.com",
        challengeId: "challenge-id",
        code: "123456",
      }),
      new RegExp("Invalid or expired"),
    );
    expect(f.getSessions()).toBe(1);
  });

  it("persists incorrect attempts and locks a code after five guesses", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        f.service.verifyEmailCode({
          email: "aline@example.com",
          challengeId: "challenge-id",
          code: "999999",
        }),
      );
    }
    expect(f.challenge.attempts).toBe(5);
    await assert.rejects(
      f.service.verifyEmailCode({
        email: "aline@example.com",
        challengeId: "challenge-id",
        code: "123456",
      }),
    );
    expect(f.getAccount()).toBeNull();
  });

  it("rejects expired codes and codes belonging to another email", async () => {
    const expired = fixture({ expiresAt: new Date(now.getTime() - 1) });
    await assert.rejects(
      expired.service.verifyEmailCode({
        email: "aline@example.com",
        challengeId: "challenge-id",
        code: "123456",
      }),
    );
    const other = fixture();
    await assert.rejects(
      other.service.verifyEmailCode({
        email: "other@example.com",
        challengeId: "challenge-id",
        code: "123456",
      }),
    );
    expect(other.getAccount()).toBeNull();
    expect(other.challenge.attempts).toBe(0);
  });

  it("rejects malformed Google tokens before creating an account", async () => {
    const f = fixture();
    await assert.rejects(
      f.service.social({ provider: "google", idToken: "invalid-token" }),
      new RegExp("Unable to verify"),
    );
    expect(f.getAccount()).toBeNull();
    expect(f.getSessions()).toBe(0);
  });
});

describe("email OTP delivery", () => {
  it("directs an unknown login email to registration without creating a challenge or sending email", async () => {
    const f = fixture();
    const initial = { ...f.challenge };
    await assert.rejects(f.service.sendEmailCode({ email: "new@example.com", purpose: "login" }), {
      status: 404, message: "No account found with this email. Please sign up first.",
    });
    expect(f.emailProvider.sent).toHaveLength(0);
    expect(f.challenge).toEqual(initial);
    expect(f.getAccount()).toBeNull();
  });

  it("rejects duplicate registration without sending a code or changing the account", async () => {
    const f = fixture();
    const existing = {
      id: "existing-user",
      email: "aline@example.com",
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerifiedAt: now,
    };
    f.setAccount(existing);
    await assert.rejects(
      f.service.sendEmailCode({
        email: " ALINE@Example.com ",
        purpose: "register",
        username: "Another name",
      }),
      { status: 409 },
    );
    expect(f.emailProvider.sent).toHaveLength(0);
    expect(f.challenge.purpose).toBe("register");
    expect(f.challenge.consumedAt).toBeNull();
    expect(f.getAccount()).toBe(existing);
    expect(f.getSessions()).toBe(0);
  });

  it("rejects registration if the account was created after the code was sent", async () => {
    const f = fixture();
    f.setAccount({ id: "existing-user", email: "aline@example.com" });
    await assert.rejects(
      f.service.verifyEmailCode({
        email: "aline@example.com",
        challengeId: "challenge-id",
        code: "123456",
      }),
      { status: 409 },
    );
    expect(f.getSessions()).toBe(0);
  });

  it("still sends a sign-in code for an existing verified email", async () => {
    const f = fixture();
    f.setAccount({
      id: "existing-user",
      email: "aline@example.com",
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerifiedAt: now,
    });
    await f.service.sendEmailCode({
      email: "ALINE@example.com",
      purpose: "login",
    });
    expect(f.emailProvider.sent).toHaveLength(1);
    expect(f.challenge.purpose).toBe("login");
  });

  it("sends the OTP with structured sender/recipient fields and branded content", async () => {
    const f = fixture();
    const result = await f.service.sendEmailCode({
      email: "ALINE@example.com",
      purpose: "register",
      username: "Aline",
    });
    expect(f.emailProvider.sent).toHaveLength(1);
    const sent = f.emailProvider.sent[0]!;
    expect(sent.to).toBe("aline@example.com");
    expect(sent.fromEmail).toBe("auth@example.com");
    expect(sent.fromName).toBe("Eventis");
    const otp = sent.text?.match(/code is (\d{6})\./)?.[1];
    expect(otp).toBeDefined();
    expect(sent.html).toContain(otp!);
    expect(sent.html).toContain("You’re almost in.");
    expect(sent.subject).toBe("Verify your email with Eventis");
    expect(result.retryAfterSeconds).toBe(60);
    expect(result).not.toHaveProperty("code");
    expect(f.getAccount()).toBeNull();
  });

  it("explains a 401 delivery failure as a likely unauthorised-IP rejection", async () => {
    const throwing = {
      send: () =>
        Promise.reject(
          new AppError(ERROR_CODES.INTERNAL_ERROR, "rejected", 502, { internal: { status: 401 } }),
        ),
    };
    const f = fixture({}, {}, throwing as unknown as FakeEmailProvider);
    await assert.rejects(
      f.service.sendEmailCode({
        email: "aline@example.com",
        purpose: "register",
        username: "Aline",
      }),
      /authorised IPs/,
    );
    expect(f.challenge.consumedAt).toEqual(now);
    expect(f.getSessions()).toBe(0);
  });

  it("invalidates the challenge and returns a generic failure for other delivery errors", async () => {
    const throwing = {
      send: () =>
        Promise.reject(
          new AppError(ERROR_CODES.INTERNAL_ERROR, "server error", 502, { internal: { status: 500 } }),
        ),
    };
    const f = fixture({}, {}, throwing as unknown as FakeEmailProvider);
    await assert.rejects(
      f.service.sendEmailCode({
        email: "aline@example.com",
        purpose: "register",
        username: "Aline",
      }),
      /Unable to send/,
    );
    expect(f.challenge.consumedAt).toEqual(now);
    expect(f.getSessions()).toBe(0);
  });

  it("explains a 403 delivery failure instead of returning a generic send failure", async () => {
    const throwing = {
      send: () =>
        Promise.reject(
          new AppError(ERROR_CODES.INTERNAL_ERROR, "forbidden", 502, { internal: { status: 403 } }),
        ),
    };
    const f = fixture({}, {}, throwing as unknown as FakeEmailProvider);
    await assert.rejects(
      f.service.sendEmailCode({ email: "aline@example.com", purpose: "register", username: "Aline" }),
      /Brevo API key’s transactional email permission/,
    );
    expect(f.challenge.consumedAt).toEqual(now);
  });

  it("fails before sending when the Brevo API key or sender is missing or invalid", async () => {
    const missing = fixture({}, { BREVO_API_KEY: undefined });
    await assert.rejects(
      missing.service.sendEmailCode({
        email: "aline@example.com",
        purpose: "login",
      }),
      /not configured/,
    );
    const invalid = fixture({}, { AUTH_EMAIL_FROM: "invalid-sender" });
    await assert.rejects(
      invalid.service.sendEmailCode({
        email: "aline@example.com",
        purpose: "login",
      }),
      /not configured correctly/,
    );
    expect(missing.emailProvider.sent).toHaveLength(0);
    expect(invalid.emailProvider.sent).toHaveLength(0);
  });

  it("uses the shared Brevo sender when AUTH_EMAIL_FROM is not set", async () => {
    const f = fixture({}, { AUTH_EMAIL_FROM: undefined, BREVO_SENDER_EMAIL: "verified@example.com" });
    await f.service.sendEmailCode({ email: "aline@example.com", purpose: "register", username: "Aline" });
    expect(f.emailProvider.sent[0]?.fromEmail).toBe("verified@example.com");
  });
});
