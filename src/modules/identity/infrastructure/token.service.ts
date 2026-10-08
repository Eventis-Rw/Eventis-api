import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { ENV, loadEnv, type Env } from "../../../config/env.js";
import { generateRefreshToken, hashSecret } from "../domain/otp.js";

export interface AccessTokenClaims {
  sub: string;
  deviceId: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface IssuedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly env: Env;
  private readonly accessSecret: Uint8Array;
  private readonly refreshPepper: string;
  private readonly otpPepper: string;
  private readonly devicePepper: string;

  constructor(
    @Inject(ENV) env: Env | undefined,
    private readonly clock: Clock,
  ) {
    const resolved = env ?? loadEnv(process.env);
    this.env = resolved;
    this.accessSecret = new TextEncoder().encode(resolved.JWT_ACCESS_SECRET);

    this.refreshPepper = `${resolved.JWT_REFRESH_SECRET}:refresh`;
    this.otpPepper = `${resolved.JWT_REFRESH_SECRET}:otp`;
    this.devicePepper = `${resolved.JWT_REFRESH_SECRET}:device`;
  }

  otpPepperValue(): string {
    return this.otpPepper;
  }

  devicePepperValue(): string {
    return this.devicePepper;
  }

  hashRefreshToken(token: string): string {
    return hashSecret(token, this.refreshPepper);
  }

  hashDeviceCredential(credential: string): string {
    return hashSecret(credential, this.devicePepper);
  }

  hashOtpCode(code: string): string {
    return hashSecret(code, this.otpPepper);
  }

  async issueAccessToken(
    claims: AccessTokenClaims,
  ): Promise<IssuedAccessToken> {
    const now = this.clock.now();
    const expiresAt = new Date(
      now.getTime() + this.env.JWT_ACCESS_TTL_SECONDS * 1000,
    );

    const token = await new SignJWT({ deviceId: claims.deviceId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.sub)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setIssuer("eventis-api")
      .setAudience("eventis-app")
      .sign(this.accessSecret);

    return { token, expiresAt };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        issuer: "eventis-api",
        audience: "eventis-app",
      });
      if (typeof payload.sub !== "string" || !payload.sub) {
        throw AppError.unauthenticated();
      }
      const deviceId =
        typeof payload.deviceId === "string" ? payload.deviceId : "";
      if (!deviceId) {
        throw AppError.unauthenticated();
      }
      return { sub: payload.sub, deviceId };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof JoseErrors.JWTExpired) {
        throw new AppError(
          ERROR_CODES.TOKEN_EXPIRED,
          "Your session has expired. Sign in again.",
          401,
        );
      }
      throw AppError.unauthenticated();
    }
  }

  issueRefreshToken(): IssuedRefreshToken {
    const token = generateRefreshToken();
    const now = this.clock.now();
    const expiresAt = new Date(
      now.getTime() + this.env.JWT_REFRESH_TTL_SECONDS * 1000,
    );
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt,
    };
  }
}
