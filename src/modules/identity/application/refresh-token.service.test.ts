import { describe, expect, it, mock } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { loadEnv } from "../../../config/env.js";
import { TokenService } from "../infrastructure/token.service.js";

import { RefreshTokenService } from "./refresh-token.service.js";

describe("RefreshTokenService role claims", () => {
  const now = new Date();
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
  const clock = new FixedClock(now);
  const tokens = new TokenService(env, clock);

  it("issues refreshed roles from the current user record", async () => {
    const refresh = tokens.issueRefreshToken();
    const sessions = {
      findByTokenHash: mock(() =>
        Promise.resolve({
          id: "session-id",
          userId: "11111111-1111-1111-1111-111111111111",
          familyId: "family-id",
          tokenHash: tokens.hashRefreshToken(refresh.token),
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          replacedById: null,
          createdAt: now,
        }),
      ),
      rotate: mock(() => Promise.resolve(undefined)),
    };
    const users = {
      findById: mock(() =>
        Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
          accountType: "POSTER" as const,
          role: "ADMIN" as const,
          status: "ACTIVE" as const,
        }),
      ),
    };
    const service = new RefreshTokenService(
      sessions as never,
      users as never,
      tokens,
      clock,
    );

    const refreshed = await service.execute({ refreshToken: refresh.token });
    const claims = await tokens.verifyAccessToken(refreshed.accessToken);

    expect(claims.roles).toEqual(["admin", "organizer_owner"]);
    expect(sessions.rotate).toHaveBeenCalledTimes(1);
  });
});
