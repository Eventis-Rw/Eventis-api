import { randomUUID } from "node:crypto";

import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  hasExceededAttempts,
  isOtpExpired,
  isOtpUsed,
  otpMatches,
} from "../domain/otp.js";
import type { OtpPurpose } from "../domain/otp.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../domain/phone.js";
import {
  OtpRepository,
  UserRepository,
} from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";
import {
  toAuthSession,
  toAuthTokens,
  type AuthSessionResponse,
} from "../mappers/auth.mapper.js";

@Injectable()
export class VerifyOtpService {
  constructor(
    private readonly otps: OtpRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: { phone: string; code: string; displayName?: string; pin?: string },
    expectedPurpose?: OtpPurpose,
  ): Promise<AuthSessionResponse> {
    let phone: string;
    try {
      phone = normalizeRwandaPhone(input.phone);
    } catch (error) {
      if (error instanceof PhoneNormalizationError) {
        throw AppError.validation({ phone: [error.message] });
      }
      throw error;
    }

    const now = this.clock.now();
    const otp = await this.otps.findLatestActive(phone);
    if (!otp) {
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "Invalid verification code",
        401,
      );
    }

    if (expectedPurpose && otp.purpose !== expectedPurpose) {
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "Invalid verification code",
        401,
      );
    }

    if (isOtpUsed(otp)) {
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "Invalid verification code",
        401,
      );
    }

    if (isOtpExpired(otp, now)) {
      throw new AppError(ERROR_CODES.OTP_EXPIRED, "OTP has expired", 401);
    }

    if (hasExceededAttempts(otp)) {
      throw new AppError(
        ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
        "Too many OTP attempts",
        429,
        { retryAfterSeconds: 300 },
      );
    }

    const pepper = this.tokens.otpPepperValue();
    if (!otpMatches(input.code, otp.codeHash, pepper)) {
      await this.otps.incrementAttempts(otp.id);
      const updated = await this.otps.findLatestActive(phone);
      if (updated && hasExceededAttempts(updated)) {
        throw new AppError(
          ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
          "Too many OTP attempts",
          429,
          { retryAfterSeconds: 300 },
        );
      }
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "Invalid verification code",
        401,
      );
    }

    const refresh = this.tokens.issueRefreshToken();
    const familyId = randomUUID();

    let result: {
      user: Awaited<ReturnType<UserRepository["completeSignIn"]>>["user"];
    };
    try {
      result = await this.users.completeSignIn({
        otpId: otp.id,
        phone,
        ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
        ...(input.pin
          ? { pinHash: this.tokens.hashPin(input.pin) }
          : otp.pinHash
            ? { pinHash: otp.pinHash }
            : {}),
        refresh: {
          tokenHash: refresh.tokenHash,
          familyId,
          expiresAt: refresh.expiresAt,
        },
        now,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message === "user inactive"
      ) {
        throw AppError.forbidden(
          "This account is inactive",
        );
      }
      if (message === "phone already registered") {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          "Phone number is already registered",
          409,
        );
      }
      if (message === "otp already used") {
        throw new AppError(
          ERROR_CODES.OTP_INVALID,
          "Invalid verification code",
          401,
        );
      }
      throw error;
    }

    const access = await this.tokens.issueAccessToken({
      sub: result.user.id,
      role: result.user.role === "ADMIN"
        ? "admin"
        : result.user.accountType === "POSTER"
          ? "organizer_owner"
          : "customer",
    });

    return toAuthSession({
      user: result.user,
      tokens: toAuthTokens({
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
      }),
    });
  }
}
