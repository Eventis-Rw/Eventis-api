import assert from "node:assert/strict";

import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { loadEnv } from "../../../config/env.js";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../domain/admin-password.js";
import { TokenService } from "../infrastructure/token.service.js";

import { AdminLoginService } from "./admin-login.service.js";
import { LoginService } from "./login.service.js";

const password = "Test admin password 42!";
const passwordHash = await hashAdminPassword(password);
const now = new Date();
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
});
function fixture(overrides: Record<string, unknown> = {}, limited = false) {
  const account = {
    id: "admin-id",
    role: "ADMIN",
    status: "ACTIVE",
    deletedAt: null,
    email: "admin@example.com",
    phone: "",
    adminPasswordHash: passwordHash,
    displayName: "Administrator",
    accountType: "CUSTOMER",
    createdAt: now,
    ...overrides,
  };
  let sessions = 0;
  let attemptedEmail = "";
  let lookup = false;
  const credentials = {
    consumeAttempt: (email: string) => {
      attemptedEmail = email;
      return limited
        ? Promise.reject(AppError.rateLimited(900))
        : Promise.resolve();
    },
    findCredential: () => {
      lookup = true;
      return Promise.resolve(overrides.missing ? null : account);
    },
    clearEmailAttempts: () => Promise.resolve(),
  };
  const users = {
    findById: () => Promise.resolve(account),
    createLoginSession: () => {
      sessions++;
      return Promise.resolve();
    },
  };
  const tokens = new TokenService(env, new FixedClock(now));
  return {
    service: new AdminLoginService(
      credentials as never,
      users as never,
      tokens,
      new FixedClock(now),
    ),
    tokens,
    getSessions: () => sessions,
    getEmail: () => attemptedEmail,
    didLookup: () => lookup,
  };
}

describe("administrator email/password login", () => {
  it("issues normal admin tokens and never serializes the password hash", async () => {
    const f = fixture();
    const result = await f.service.execute(
      { email: " ADMIN@Example.com ", password },
      "127.0.0.1",
    );
    expect(f.getEmail()).toBe("admin@example.com");
    expect(result.user.roles).toContain("admin");
    expect(result.user.phone).toBe("");
    expect(f.getSessions()).toBe(1);
    expect(
      (await f.tokens.verifyAccessToken(result.tokens.accessToken)).roles,
    ).toContain("admin");
    expect(JSON.stringify(result)).not.toContain(passwordHash);
    expect(JSON.stringify(result)).not.toContain(password);
  });
  it("uses the same rejection for wrong passwords, unknown accounts and restricted users", async () => {
    for (const overrides of [
      {},
      { missing: true },
      { role: "CUSTOMER" },
      { status: "INACTIVE" },
      { deletedAt: now },
      { adminPasswordHash: null },
    ]) {
      const f = fixture(overrides);
      const wrong = Object.keys(overrides).length === 0;
      await assert.rejects(
        f.service.execute(
          {
            email: "admin@example.com",
            password: wrong ? "Wrong password" : password,
          },
          "127.0.0.1",
        ),
        /Unable to sign in with these credentials/,
      );
      expect(f.getSessions()).toBe(0);
    }
  });
  it("rejects throttled attempts before account lookup or session creation", async () => {
    const f = fixture({}, true);
    await assert.rejects(
      f.service.execute({ email: "admin@example.com", password }, "127.0.0.1"),
      (error: unknown) => error instanceof AppError && error.status === 429,
    );
    expect(f.didLookup()).toBe(false);
    expect(f.getSessions()).toBe(0);
  });
});

describe("admin password storage", () => {
  it("uses independent salts and preserves whitespace as part of passwords", async () => {
    const first = await hashAdminPassword("  twelve secure characters  ");
    const second = await hashAdminPassword("  twelve secure characters  ");
    expect(first).not.toBe(second);
    expect(
      await verifyAdminPassword("  twelve secure characters  ", first),
    ).toBe(true);
    expect(await verifyAdminPassword("twelve secure characters", first)).toBe(
      false,
    );
  });
  it("rejects weak seed passwords and malformed hashes", async () => {
    await assert.rejects(hashAdminPassword("short"), /at least 12/);
    expect(await verifyAdminPassword(password, "plaintext-password")).toBe(
      false,
    );
    expect(await verifyAdminPassword("x".repeat(257), passwordHash)).toBe(
      false,
    );
  });
});

it("does not authenticate admin identities through the public phone/PIN endpoint", async () => {
  const tokens = new TokenService(env, new FixedClock(now));
  const users = { findByPhone: () => Promise.resolve({ role: "ADMIN", status: "ACTIVE", pinHash: tokens.hashPin("12345") }) };
  const service = new LoginService(users as never, tokens);
  await assert.rejects(service.execute({ phone: "+250788123456", pin: "12345" }), /Unable to sign in/);
});
