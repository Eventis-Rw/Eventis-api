import { Injectable } from "@nestjs/common";
import { ERROR_CODES, type AuthTokens, type RefreshRequest } from "@eventis/contracts";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { isRefreshReusable, isRefreshReuse } from "../domain/user.js";
import {
  RefreshSessionRepository,
  UserRepository,
} from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";
import { toAuthTokens } from "../mappers/auth.mapper.js";

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(input: RefreshRequest): Promise<AuthTokens> {
    const tokenHash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    const now = this.clock.now();

    if (!session) {
      throw AppError.unauthenticated("Invalid refresh token");
    }

    if (isRefreshReuse(session)) {
      await this.sessions.revokeFamily(session.familyId, now);
      throw new AppError(
        ERROR_CODES.TOKEN_REUSE_DETECTED,
        "Session revoked for security. Sign in again.",
        401,
      );
    }

    if (!isRefreshReusable(session, now)) {
      throw new AppError(
        ERROR_CODES.TOKEN_EXPIRED,
        "Your session has expired. Sign in again.",
        401,
      );
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      throw AppError.unauthenticated();
    }

    const next = this.tokens.issueRefreshToken();
    await this.sessions.rotate({
      oldSessionId: session.id,
      userId: session.userId,
      familyId: session.familyId,
      deviceId: session.deviceId,
      newTokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
      now,
    });

    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      deviceId: session.deviceId,
    });

    return toAuthTokens({
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: next.token,
      refreshTokenExpiresAt: next.expiresAt,
    });
  }
}
