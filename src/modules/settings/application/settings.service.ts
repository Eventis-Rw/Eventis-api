import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";
import type {
  DeletionChannel,
  NotificationCategory,
  PhoneVerificationPurpose,
  PushPlatform,
} from "@prisma/client";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
  SMS_PROVIDER,
  TokenService,
  type SmsProvider,
} from "../../identity/index.js";
import { SettingsRepository } from "../infrastructure/settings.repository.js";
import {
  toNotificationPreferenceResponse,
  toNotificationResponse,
  toPreferenceResponse,
} from "../mappers/settings.mapper.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export interface PreferenceInput {
  preferredLocation?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  language?: string | null | undefined;
  categoryIds?: string[] | undefined;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly tokens: TokenService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly clock: Clock,
  ) {}

  async getPreferences(userId: string) {
    const { preference, categoryIds } =
      await this.repository.getPreference(userId);
    return toPreferenceResponse(preference, categoryIds);
  }

  async updatePreferences(userId: string, input: PreferenceInput) {
    const preference = await this.repository.upsertPreference(userId, {
      preferredLocation: input.preferredLocation,
      latitude: input.latitude,
      longitude: input.longitude,
      language: input.language,
    });
    if (input.categoryIds !== undefined) {
      await this.repository.replacePreferenceCategories(
        userId,
        input.categoryIds,
      );
    }
    const current = await this.repository.getPreference(userId);
    return toPreferenceResponse(
      preference,
      current.categoryIds,
    );
  }

  async getNotificationPreferences(userId: string) {
    return toNotificationPreferenceResponse(
      await this.repository.getNotificationPreference(userId),
    );
  }

  async updateNotificationPreferences(
    userId: string,
    input: {
      eventRecommendations?: boolean | undefined;
      categoryUpdates?: boolean | undefined;
      eventUpdates?: boolean | undefined;
      savedOrganiserUpdates?: boolean | undefined;
      promotional?: boolean | undefined;
    },
  ) {
    const row = await this.repository.upsertNotificationPreference(
      userId,
      input,
    );
    return toNotificationPreferenceResponse(row);
  }

  async listNotifications(
    userId: string,
    input: {
      page: number;
      limit: number;
      unreadOnly: boolean;
      category?: NotificationCategory | undefined;
    },
  ) {
    const { items, total } = await this.repository.listNotifications({
      userId,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      unreadOnly: input.unreadOnly,
      category: input.category,
    });
    return {
      items: items.map(toNotificationResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async markNotificationRead(userId: string, id: string) {
    const row = await this.repository.markNotificationRead(
      userId,
      id,
      this.clock.now(),
    );
    if (!row) throw AppError.notFound("That notification");
    return toNotificationResponse(row);
  }

  async markAllNotificationsRead(userId: string) {
    const count = await this.repository.markAllNotificationsRead(
      userId,
      this.clock.now(),
    );
    return { updated: count };
  }

  async registerPushToken(
    userId: string,
    input: { token: string; platform: PushPlatform },
  ) {
    const row = await this.repository.registerPushToken({
      userId,
      token: input.token.trim(),
      platform: input.platform,
      now: this.clock.now(),
    });
    return {
      id: row.id,
      token: row.token,
      platform: row.platform,
      lastSeenAt: row.lastSeenAt.toISOString(),
    };
  }

  async removePushToken(userId: string, token: string) {
    await this.repository.removePushToken(userId, token.trim());
    return { removed: true };
  }

  async requestPhoneVerification(
    userId: string,
    input: { phone: string; purpose: PhoneVerificationPurpose },
  ) {
    const user = await this.repository.getUser(userId);
    if (!user || user.deletedAt) throw AppError.notFound("That account");
    const phone = normalizePhone(input.phone);
    const now = this.clock.now();
    const latest = await this.repository.findLatestPhoneVerification(
      userId,
      input.purpose,
    );
    if (latest) {
      const retryAfter = Math.ceil(
        (latest.createdAt.getTime() + RESEND_COOLDOWN_MS - now.getTime()) /
          1000,
      );
      if (retryAfter > 0) {
        throw new AppError(
          ERROR_CODES.OTP_SEND_THROTTLED,
          "Please wait before requesting another code",
          429,
          { retryAfterSeconds: retryAfter },
        );
      }
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row = await this.repository.createPhoneVerification({
      userId,
      phone,
      codeHash: this.tokens.hashOtpCode(code),
      purpose: input.purpose,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
    try {
      await this.sms.send({
        to: phone,
        message: `Your Eventis verification code is ${code}. It expires in 10 minutes.`,
      });
    } catch (error) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Unable to send verification code",
        502,
        { cause: error },
      );
    }
    return {
      id: row.id,
      phone: maskPhone(phone),
      expiresAt: row.expiresAt.toISOString(),
      retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    };
  }

  async confirmPhoneVerification(
    userId: string,
    id: string,
    code: string,
  ) {
    const row = await this.repository.findPhoneVerification(userId, id);
    if (!row) throw AppError.notFound("That verification request");
    if (row.verifiedAt) return { verified: true };
    const now = this.clock.now();
    if (now.getTime() >= row.expiresAt.getTime()) {
      throw new AppError(
        ERROR_CODES.OTP_EXPIRED,
        "This verification code has expired",
        422,
      );
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new AppError(
        ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
        "Too many incorrect attempts. Request a new code.",
        422,
      );
    }
    if (!hashMatches(code, row.codeHash, this.tokens.otpPepperValue())) {
      await this.repository.incrementPhoneVerificationAttempts(row.id);
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "That verification code is not correct",
        422,
      );
    }
    await this.repository.verifyPhone(userId, row.id, now);
    return { verified: true, phone: maskPhone(row.phone) };
  }

  async requestAccountDeletion(
    userId: string,
    channel: DeletionChannel,
  ) {
    const user = await this.repository.getUser(userId);
    if (!user || user.deletedAt) throw AppError.notFound("That account");
    if (channel === "EMAIL" && !user.email) {
      throw AppError.validation({
        channel: ["Add an email address before using email verification"],
      });
    }
    const now = this.clock.now();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row = await this.repository.createDeletionChallenge({
      userId,
      channel,
      codeHash: this.tokens.hashOtpCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
    if (channel === "SMS") {
      try {
        await this.sms.send({
          to: user.phone,
          message: `Your Eventis account deletion code is ${code}. It expires in 10 minutes.`,
        });
      } catch (error) {
        throw new AppError(
          ERROR_CODES.INTERNAL_ERROR,
          "Unable to send verification code",
          502,
          { cause: error },
        );
      }
    }
    return {
      id: row.id,
      channel,
      expiresAt: row.expiresAt.toISOString(),
      message:
        channel === "SMS"
          ? `A deletion code was sent to ${maskPhone(user.phone)}`
          : "A deletion code was requested by email",
    };
  }

  async confirmAccountDeletion(
    userId: string,
    id: string,
    code: string,
  ) {
    const row = await this.repository.findDeletionChallenge(userId, id);
    if (!row) throw AppError.notFound("That deletion request");
    const now = this.clock.now();
    if (row.verifiedAt) return { deleted: true };
    if (now.getTime() >= row.expiresAt.getTime()) {
      throw new AppError(
        ERROR_CODES.OTP_EXPIRED,
        "This deletion code has expired",
        422,
      );
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new AppError(
        ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
        "Too many incorrect attempts. Request a new code.",
        422,
      );
    }
    if (!hashMatches(code, row.codeHash, this.tokens.otpPepperValue())) {
      await this.repository.incrementDeletionAttempts(row.id);
      throw new AppError(
        ERROR_CODES.OTP_INVALID,
        "That deletion code is not correct",
        422,
      );
    }
    await this.repository.deleteAccount(userId, row.id, now);
    return { deleted: true };
  }

  async getAccountDeletionStatus(userId: string) {
    const user = await this.repository.getUser(userId);
    return { deleted: Boolean(user?.deletedAt) };
  }
}

function normalizePhone(value: string): string {
  try {
    return normalizeRwandaPhone(value);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      throw AppError.validation({ phone: ["Enter a valid Rwanda mobile number"] });
    }
    throw error;
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

function hashMatches(code: string, hash: string, pepper: string): boolean {
  const actual = Buffer.from(
    createHmac("sha256", pepper).update(code).digest("hex"),
    "hex",
  );
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
