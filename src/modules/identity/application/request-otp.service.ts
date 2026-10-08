import { Inject, Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  type OtpRequest,
  type OtpRequestResponse,
} from "@eventis/contracts";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  OTP_DAILY_LIMIT_PER_DEVICE,
  OTP_DAILY_LIMIT_PER_PHONE,
  OTP_RESEND_COOLDOWN_MS,
  generateOtpCode,
  otpExpiresAt,
  resendCooldownSeconds,
} from "../domain/otp.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../domain/phone.js";
import { OtpRepository } from "../infrastructure/identity.repository.js";
import {
  SMS_PROVIDER,
  buildOtpSmsMessage,
  type SmsProvider,
} from "../infrastructure/sms/sms-provider.js";
import { TokenService } from "../infrastructure/token.service.js";
import { UserRepository } from "../infrastructure/identity.repository.js";

@Injectable()
export class RequestOtpService {
  constructor(
    private readonly otps: OtpRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly clock: Clock,
  ) { }

  async execute(
    input: OtpRequest & { firstName?: string; accountType?: "POSTER" | "LOVE" },
  ): Promise<OtpRequestResponse> {
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
    const purpose = input.accountType ? "SIGN_UP" : "SIGN_IN";
    if (purpose === "SIGN_UP" && (await this.users.findByPhone(phone))) {
      throw AppError.conflict(
        ERROR_CODES.FORBIDDEN,
        "Phone number is already registered",
      );
    }
    const latest = await this.otps.findLatestAny(phone);
    if (purpose === "SIGN_UP" && latest && latest.deviceId === input.deviceId) {
      const requestedFirstName = input.firstName ?? null;
      const requestedAccountType = input.accountType ?? "LOVE";
      if (
        latest.firstName !== requestedFirstName ||
        (latest.accountType ?? "LOVE") !== requestedAccountType
      ) {
        throw AppError.conflict(
          ERROR_CODES.FORBIDDEN,
          "This signup request does not match the current phone and device identity",
        );
      }
    }
    if (latest) {
      const cooldown = resendCooldownSeconds(latest.createdAt, now);
      if (cooldown > 0) {
        throw new AppError(
          ERROR_CODES.OTP_SEND_THROTTLED,
          "Please wait before requesting another code",
          429,
          { retryAfterSeconds: cooldown },
        );
      }
    }

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const phoneCount = await this.otps.countSince({ phone }, dayAgo);
    if (phoneCount >= OTP_DAILY_LIMIT_PER_PHONE) {
      throw AppError.rateLimited(3600);
    }
    const deviceCount = await this.otps.countSince(
      { deviceId: input.deviceId },
      dayAgo,
    );
    if (deviceCount >= OTP_DAILY_LIMIT_PER_DEVICE) {
      throw AppError.rateLimited(3600);
    }

    const code = generateOtpCode();
    const codeHash = this.tokens.hashOtpCode(code);
    const expiresAt = otpExpiresAt(now);

    await this.otps.create({
      phone,
      codeHash,
      purpose,
      deviceId: input.deviceId,
      expiresAt,
      ...(purpose === "SIGN_UP"
        ? { firstName: input.firstName, accountType: input.accountType }
        : {}),
    });

    try {
      await this.sms.send({
        to: phone,
        message: buildOtpSmsMessage(code),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Unable to send verification code",
        502,
        { cause: error },
      );
    }

    return {
      retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
