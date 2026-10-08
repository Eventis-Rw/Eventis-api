import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { secretMatches } from "../domain/otp.js";
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
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    phone: string;
    deviceId: string;
    deviceCredential: string;
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
    const device = user
      ? await this.users.findDeviceByUserId(user.id, input.deviceId)
      : null;
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !device ||
      !secretMatches(
        input.deviceCredential,
        device.credentialHash,
        this.tokens.devicePepperValue(),
      )
    ) {
      throw AppError.unauthenticated(
        "Unable to sign in with these credentials",
      );
    }

    const refresh = this.tokens.issueRefreshToken();
    await this.users.createLoginSession({
      userId: user.id,
      deviceId: input.deviceId,
      refresh: {
        tokenHash: refresh.tokenHash,
        familyId: randomUUID(),
        expiresAt: refresh.expiresAt,
      },
      now: this.clock.now(),
    });
    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      deviceId: input.deviceId,
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
