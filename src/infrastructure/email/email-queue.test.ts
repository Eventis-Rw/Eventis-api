import { describe, expect, it } from "bun:test";

import { loadEnv } from "../../config/env.js";

import { EmailQueue } from "./email-queue.js";

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

describe("EmailQueue.enqueue", () => {
  it("adds a job carrying the email payload and the given jobId for dedup", async () => {
    const calls: Array<{ name: string; data: unknown; opts: Record<string, unknown> }> = [];
    const stubQueue = {
      add: (name: string, data: unknown, opts: Record<string, unknown> = {}) => {
        calls.push({ name, data, opts });
        return Promise.resolve();
      },
    };
    const queue = new EmailQueue(env, stubQueue as never);

    await queue.enqueue(
      { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" },
      "payment-approved:PAY-1",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toEqual({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(calls[0]?.opts).toEqual({ jobId: "payment-approved:PAY-1" });
  });

  it("omits jobId when none is given", async () => {
    const calls: Array<{ opts: Record<string, unknown> }> = [];
    const stubQueue = {
      add: (_name: string, _data: unknown, opts: Record<string, unknown> = {}) => {
        calls.push({ opts });
        return Promise.resolve();
      },
    };
    const queue = new EmailQueue(env, stubQueue as never);

    await queue.enqueue({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });

    expect(calls[0]?.opts).toEqual({});
  });

  it("swallows enqueue failures and logs instead of throwing (best-effort contract)", async () => {
    const stubQueue = {
      add: () => Promise.reject(new Error("redis down")),
    };
    const queue = new EmailQueue(env, stubQueue as never);

    await queue.enqueue({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
    // No throw means the best-effort contract held.
  });
});
