import { beforeAll, describe, expect, it } from "bun:test";

import { ERROR_CODES } from "@eventis/contracts";
import { SignJWT } from "jose";

import { SystemClock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { loadEnv } from "../../../config/env.js";

import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://u:p@localhost:5432/eventis",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
    JWT_ACCESS_TTL_SECONDS: "60",
    JWT_REFRESH_TTL_SECONDS: "3600",
    TICKET_SIGNING_PRIVATE_KEY: "priv",
    TICKET_SIGNING_PUBLIC_KEY: "pub",
    STORAGE_ENDPOINT: "http://localhost:9000",
    STORAGE_BUCKET: "eventis-dev",
    STORAGE_ACCESS_KEY_ID: "key",
    STORAGE_SECRET_ACCESS_KEY: "secret",
    SMS_PROVIDER: "fake",
  });

  const clock = new SystemClock();
  let tokens: TokenService;

  beforeAll(() => {
    tokens = new TokenService(env, clock);
  });

  it("issues and verifies an access token", async () => {
    const issued = await tokens.issueAccessToken({
      sub: "11111111-1111-1111-1111-111111111111",
      deviceId: "device-install-01",
    });
    const claims = await tokens.verifyAccessToken(issued.token);
    expect(claims.sub).toBe("11111111-1111-1111-1111-111111111111");
    expect(claims.deviceId).toBe("device-install-01");
  });

  it("rejects an expired access token", async () => {
    const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const expired = await new SignJWT({ deviceId: "d1" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("11111111-1111-1111-1111-111111111111")
      .setIssuer("eventis-api")
      .setAudience("eventis-app")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret);

    try {
      await tokens.verifyAccessToken(expired);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ERROR_CODES.TOKEN_EXPIRED);
    }
  });

  it("issues opaque refresh tokens and hashes them", () => {
    const a = tokens.issueRefreshToken();
    const b = tokens.issueRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(tokens.hashRefreshToken(a.token)).toBe(a.tokenHash);
    expect(a.tokenHash).not.toBe(a.token);
  });
});
