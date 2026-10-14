import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../domain/phone.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";
import { toAuthSession, toAuthTokens } from "../mappers/auth.mapper.js";
import type { AuthSessionResponse } from "../mappers/auth.mapper.js";

@Injectable()
export class LoginService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: {
    phone: string;
    pin: string;
  }): Promise<AuthSessionResponse> {
    let phone: string;
    try {
      phone = normalizeRwandaPhone(input.phone);
    } catch (error) {
      if (error instanceof PhoneNormalizationError) {
        throw AppError.validation({ phone: [error.message] });
      }
      throw error;
    }

    const user = await this.users.findByPhone(phone);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !user.pinHash ||
      !this.tokens.pinMatches(input.pin, user.pinHash)
    ) {
      throw AppError.unauthenticated(
        "Unable to sign in with these credentials",
      );
    }

    const refresh = this.tokens.issueRefreshToken();
    await this.users.createLoginSession({
      userId: user.id,
      refresh: {
        tokenHash: refresh.tokenHash,
        familyId: randomUUID(),
        expiresAt: refresh.expiresAt,
      },
    });
    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      role: user.role === "ADMIN"
        ? "admin"
        : user.accountType === "POSTER"
          ? "organizer_owner"
          : "customer",
    });
    return toAuthSession({
      user,
      tokens: toAuthTokens({
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
      }),
    });
  }
}
