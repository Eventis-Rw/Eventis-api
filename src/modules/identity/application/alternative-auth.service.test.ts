import assert from "node:assert/strict";

import { describe, expect, it, spyOn } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { loadEnv } from "../../../config/env.js";
import { TokenService } from "../infrastructure/token.service.js";

import { AlternativeAuthService } from "./alternative-auth.service.js";

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
) {
  const tokens = new TokenService(env, new FixedClock(now));
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
    { ...env, ...envOverrides },
  );
  return {
    service,
    challenge,
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

describe("Brevo email OTP delivery", () => {
  it("directs an unknown login email to registration without creating a challenge or sending email", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    try {
      const f = fixture();
      const initial = { ...f.challenge };
      await assert.rejects(f.service.sendEmailCode({ email: "new@example.com", purpose: "login" }), {
        status: 404, message: "No account found with this email. Please sign up first.",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(f.challenge).toEqual(initial);
      expect(f.getAccount()).toBeNull();
    } finally { fetchSpy.mockRestore(); }
  });

  it("rejects duplicate registration without sending a code or changing the account", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    try {
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
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(f.challenge.purpose).toBe("register");
      expect(f.challenge.consumedAt).toBeNull();
      expect(f.getAccount()).toBe(existing);
      expect(f.getSessions()).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
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
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 201 }),
    );
    try {
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
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(f.challenge.purpose).toBe("login");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("sends the OTP with Brevo authentication and structured sender/recipient fields", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageId: "test-message" }), {
        status: 201,
      }),
    );
    try {
      const f = fixture();
      const result = await f.service.sendEmailCode({
        email: "ALINE@example.com",
        purpose: "register",
        username: "Aline",
      });
      const call = fetchSpy.mock.calls[0]!;
      expect(call[0]).toBe("https://api.brevo.com/v3/smtp/email");
      const options = call[1]!;
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({
        "api-key": "test-email-key",
        "Content-Type": "application/json",
      });
      assert.ok(typeof options.body === "string");
      const body = JSON.parse(options.body) as {
        sender: { email: string; name: string };
        to: { email: string }[];
        textContent: string;
        htmlContent: string;
        subject: string;
      };
      expect(body.sender).toEqual({
        email: "auth@example.com",
        name: "Eventis",
      });
      expect(body.to).toEqual([{ email: "aline@example.com" }]);
      const otp = body.textContent.match(/code is (\d{6})\./)?.[1];
      expect(otp).toBeDefined();
      expect(body.htmlContent).toContain(otp!);
      expect(body.htmlContent).toContain("You’re almost in.");
      expect(body.subject).toBe(`${otp} · Verify your email with Eventis`);
      expect(body.htmlContent).toContain(`${otp} is your Eventis verification code.`);
      expect(result.retryAfterSeconds).toBe(60);
      expect(result).not.toHaveProperty("code");
      expect(f.getAccount()).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("explains Brevo 401 responses as a likely unauthorised-IP rejection", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rejected", { status: 401 }),
    );
    try {
      const f = fixture();
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
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("invalidates the challenge and returns a generic failure for other Brevo errors", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server error", { status: 500 }),
    );
    try {
      const f = fixture();
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
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("explains Brevo 403 responses instead of returning a generic send failure", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"code":"forbidden"}', { status: 403 }),
    );
    try {
      const f = fixture();
      await assert.rejects(
        f.service.sendEmailCode({ email: "aline@example.com", purpose: "register", username: "Aline" }),
        /Brevo API key’s transactional email permission/,
      );
      expect(f.challenge.consumedAt).toEqual(now);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("fails before sending when the Brevo API key or sender is missing or invalid", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    try {
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
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("uses the shared Brevo sender when AUTH_EMAIL_FROM is not set", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 201 }));
    try {
      const f = fixture({}, { AUTH_EMAIL_FROM: undefined, BREVO_SENDER_EMAIL: "verified@example.com" });
      await f.service.sendEmailCode({ email: "aline@example.com", purpose: "register", username: "Aline" });
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const payload = JSON.parse(String(init.body)) as { sender: { email: string } };
      expect(payload.sender.email).toBe("verified@example.com");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
