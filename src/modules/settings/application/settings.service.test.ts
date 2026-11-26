import assert from "node:assert/strict";

import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { loadEnv } from "../../../config/env.js";
import { EmailService } from "../../../infrastructure/email/email.service.js";
import { FakeEmailProvider } from "../../../infrastructure/email/fake-email.provider.js";
import { TokenService } from "../../identity/infrastructure/token.service.js";
import type { SettingsRepository } from "../infrastructure/settings.repository.js";

import { SettingsService } from "./settings.service.js";

const now = new Date("2026-11-26T10:00:00Z");
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

function fixture(user: { phone: string | null; email: string | null }) {
  const tokens = new TokenService(env, new FixedClock(now));
  const emailProvider = new FakeEmailProvider();
  const emails = new EmailService(emailProvider, { enqueue: () => Promise.resolve() } as never);
  const smsSent: Array<{ to: string; message: string }> = [];
  const sms = { send: (input: { to: string; message: string }) => { smsSent.push(input); return Promise.resolve(); } };
  let createdChallenge: Record<string, unknown> | undefined;
  const repository = {
    getUser: () => Promise.resolve({ id: "user-1", ...user, deletedAt: null }),
    createDeletionChallenge: (input: Record<string, unknown>) => {
      createdChallenge = { id: "challenge-1", attempts: 0, verifiedAt: null, ...input };
      return Promise.resolve(createdChallenge);
    },
  } as unknown as SettingsRepository;
  const service = new SettingsService(repository, tokens, sms as never, emails, new FixedClock(now));
  return { service, emailProvider, smsSent, getChallenge: () => createdChallenge };
}

describe("SettingsService.requestAccountDeletion", () => {
  it("sends a branded deletion code email over the EMAIL channel", async () => {
    const f = fixture({ phone: null, email: "aline@example.com" });

    const result = await f.service.requestAccountDeletion("user-1", "EMAIL");

    expect(f.emailProvider.sent).toHaveLength(1);
    const sent = f.emailProvider.sent[0]!;
    expect(sent.to).toBe("aline@example.com");
    expect(sent.subject).toContain("deletion code");
    expect(result.channel).toBe("EMAIL");
    expect(result.message).toContain("al***@example.com");
  });

  it("still sends an SMS for the SMS channel and does not touch email", async () => {
    const f = fixture({ phone: "250788123456", email: "aline@example.com" });

    const result = await f.service.requestAccountDeletion("user-1", "SMS");

    expect(f.smsSent).toHaveLength(1);
    expect(f.emailProvider.sent).toHaveLength(0);
    expect(result.channel).toBe("SMS");
  });

  it("rejects the EMAIL channel when the account has no email", async () => {
    const f = fixture({ phone: "250788123456", email: null });

    await assert.rejects(f.service.requestAccountDeletion("user-1", "EMAIL"));
    expect(f.emailProvider.sent).toHaveLength(0);
  });
});
