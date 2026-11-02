import { describe, expect, it } from "bun:test";

import { loadEnv } from "./env.js";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@localhost:5432/eventis",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  TICKET_SIGNING_PRIVATE_KEY: "priv",
  TICKET_SIGNING_PUBLIC_KEY: "pub",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "eventis-dev",
  STORAGE_ACCESS_KEY_ID: "key",
  STORAGE_SECRET_ACCESS_KEY: "secret",
};

describe("loadEnv", () => {
  it("applies defaults for anything optional", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.PAYMENT_PROVIDER).toBe("fake");
  });

  it("refuses a short JWT secret rather than running with weak signing", () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: "short" })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it("refuses to boot production against the fake payment provider", () => {
    expect(() =>
      loadEnv({
        ...valid,
        NODE_ENV: "production",
        SMS_PROVIDER: "africas_talking",
        AT_USERNAME: "sandbox",
        AT_API_KEY: "key",
      }),
    ).toThrow(/PAYMENT_PROVIDER/);
  });

  it("refuses africas_talking without AT credentials", () => {
    expect(() =>
      loadEnv({ ...valid, SMS_PROVIDER: "africas_talking" }),
    ).toThrow(/AT_API_KEY/);
  });

  it("accepts africas_talking when AT credentials are present", () => {
    const env = loadEnv({
      ...valid,
      SMS_PROVIDER: "africas_talking",
      AT_USERNAME: "sandbox",
      AT_API_KEY: "atsk_test",
    });
    expect(env.SMS_PROVIDER).toBe("africas_talking");
    expect(env.AT_USERNAME).toBe("sandbox");
  });

  it("defaults JWT TTLs", () => {
    const env = loadEnv(valid);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.JWT_REFRESH_TTL_SECONDS).toBe(2_592_000);
  });

  it("refuses a real payment provider with no webhook secret, which would accept spoofed webhooks", () => {
    expect(() => loadEnv({ ...valid, PAYMENT_PROVIDER: "aggregator" })).toThrow(
      /PAYMENT_WEBHOOK_SECRET/,
    );
  });

  it("never puts a secret value in the error message", () => {
    try {
      loadEnv({ ...valid, JWT_ACCESS_SECRET: "supersecretvalue" });
    } catch (e) {
      expect((e as Error).message).not.toContain("supersecretvalue");
    }
  });
});
