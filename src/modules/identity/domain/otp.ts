import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";


export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export const OTP_DAILY_LIMIT_PER_PHONE = 10;
export const OTP_DAILY_LIMIT_PER_DEVICE = 20;

export type OtpPurpose = "SIGN_IN" | "SIGN_UP";

export interface OtpRecord {
  readonly id: string;
  readonly phone: string;
  readonly codeHash: string;
  readonly purpose: OtpPurpose;
  readonly deviceId: string;
  readonly firstName?: string | null;
  readonly accountType?: "POSTER" | "LOVE" | null;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(code).digest("hex");
}

export function otpMatches(
  code: string,
  codeHash: string,
  pepper: string,
): boolean {
  const actual = Buffer.from(hashOtp(code, pepper), "hex");
  const expected = Buffer.from(codeHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isOtpExpired(otp: OtpRecord, now: Date): boolean {
  return now.getTime() >= otp.expiresAt.getTime();
}

export function isOtpUsed(otp: OtpRecord): boolean {
  return otp.verifiedAt !== null;
}

export function hasExceededAttempts(otp: OtpRecord): boolean {
  return otp.attempts >= OTP_MAX_ATTEMPTS;
}

export function resendCooldownSeconds(lastCreatedAt: Date, now: Date): number {
  const elapsed = now.getTime() - lastCreatedAt.getTime();
  const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

export function otpExpiresAt(now: Date): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

export function generateDeviceCredential(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export function secretMatches(
  value: string,
  hash: string,
  pepper: string,
): boolean {
  const actual = Buffer.from(hashSecret(value, pepper), "hex");
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function generateFamilyId(): string {
  return randomBytes(16)
    .toString("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}
