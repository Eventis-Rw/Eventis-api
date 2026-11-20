import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { ENV, type Env } from "../../../config/env.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import { generateOtpCode, otpMatches } from "../domain/otp.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";
import {
  toAuthRoles,
  toAuthSession,
  toAuthTokens,
} from "../mappers/auth.mapper.js";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

@Injectable()
export class AlternativeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async sendEmailCode(input: {
    email: string;
    purpose: "login" | "register";
    username?: string | undefined;
  }) {
    if (!this.env.BREVO_API_KEY || !this.env.AUTH_EMAIL_FROM) {
      throw AppError.forbidden("Email sign-in is not configured yet.");
    }
    const senderMatch = this.env.AUTH_EMAIL_FROM.match(
      /^\s*([^<>]*)<([^<>]+)>\s*$/,
    );
    const senderEmail = (senderMatch?.[2] ?? this.env.AUTH_EMAIL_FROM).trim();
    const senderName = senderMatch?.[1]?.trim() || "Eventis";
    if (!z.email().safeParse(senderEmail).success) {
      throw AppError.forbidden(
        "Email sign-in sender is not configured correctly.",
      );
    }
    if (input.purpose === "register" && !input.username) {
      throw AppError.validation({ username: ["Enter your username"] });
    }
    const email = input.email.trim().toLowerCase();
    const now = this.clock.now();
    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    // Lock the email across API instances, so parallel sends cannot bypass limits.
    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))::text`;
      const recent = await tx.emailSignInCode.findFirst({
        where: { email },
        orderBy: { createdAt: "desc" },
      });
      if (recent && now.getTime() - recent.createdAt.getTime() < 60_000)
        throw AppError.rateLimited(60);
      const count = await tx.emailSignInCode.count({
        where: {
          email,
          createdAt: { gte: new Date(now.getTime() - 86_400_000) },
        },
      });
      if (count >= 10) throw AppError.rateLimited(3600);
      const user = await tx.user.findUnique({ where: { email } });
      // Never turn an unverified email entered in a phone profile into a login identity.
      const eligible =
        input.purpose === "register"
          ? !user
          : Boolean(user?.emailVerifiedAt && user.status === "ACTIVE");
      await tx.emailSignInCode.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.emailSignInCode.create({
        data: {
          email,
          purpose: eligible ? input.purpose : "unavailable",
          username: input.username ?? null,
          codeHash: this.tokens.hashOtpCode(code),
          expiresAt,
        },
      });
    });
    // Same response for existing and unknown accounts to avoid account enumeration.
    if (challenge.purpose !== "unavailable") {
      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": this.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { email: senderEmail, name: senderName },
            to: [{ email }],
            subject: "Your Eventis verification code",
            textContent: `Your Eventis code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Email delivery failed");
      } catch {
        await this.prisma.emailSignInCode.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        throw AppError.forbidden(
          "Unable to send your email code. Please try again later.",
        );
      }
    }
    return {
      challengeId: challenge.id,
      retryAfterSeconds: 60,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyEmailCode(input: {
    email: string;
    challengeId: string;
    code: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const now = this.clock.now();
    // Invalid attempts must commit, so return an outcome from the transaction before throwing.
    const userId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))::text`;
      const challenge = await tx.emailSignInCode.findUnique({
        where: { id: input.challengeId },
      });
      if (
        !challenge ||
        challenge.email !== email ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attempts >= 5 ||
        challenge.purpose === "unavailable"
      )
        return null;
      await tx.emailSignInCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (
        !otpMatches(
          input.code,
          challenge.codeHash,
          this.tokens.otpPepperValue(),
        )
      )
        return null;
      const existing = await tx.user.findUnique({ where: { email } });
      if (challenge.purpose === "register" && existing) return null;
      if (
        challenge.purpose === "login" &&
        (!existing?.emailVerifiedAt || existing.status !== "ACTIVE")
      )
        return null;
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            emailVerifiedAt: now,
            displayName: challenge.username,
            firstName: challenge.username,
            accountType: "CUSTOMER",
          },
        }));
      await tx.emailSignInCode.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      return user.id;
    });
    if (!userId)
      throw AppError.unauthenticated(
        "Invalid or expired code. Request a new code and try again.",
      );
    return this.session(userId);
  }

  async social(input: {
    provider: "google" | "apple";
    idToken: string;
    nonce?: string | undefined;
    username?: string | undefined;
  }) {
    const audiences = (
      input.provider === "google"
        ? this.env.GOOGLE_AUTH_CLIENT_IDS
        : this.env.APPLE_AUTH_CLIENT_IDS
    )
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!audiences?.length)
      throw AppError.forbidden(
        `${input.provider === "google" ? "Google" : "Apple"} sign-in is not configured yet.`,
      );
    let identity: { subject: string; email: string | null; name: string };
    try {
      const { payload } = await jwtVerify(
        input.idToken,
        input.provider === "google" ? googleKeys : appleKeys,
        {
          issuer:
            input.provider === "google"
              ? ["https://accounts.google.com", "accounts.google.com"]
              : "https://appleid.apple.com",
          audience: audiences,
          algorithms: ["RS256"],
          maxTokenAge: input.provider === "google" ? "1 hour" : "10 minutes",
        },
      );
      if (!payload.sub) throw new Error("Missing identity");
      if (
        input.provider === "apple" &&
        (!input.nonce ||
          payload.nonce !==
            createHash("sha256").update(input.nonce).digest("hex"))
      )
        throw new Error("Invalid nonce");
      const verified =
        payload.email_verified === true || payload.email_verified === "true";
      identity = {
        subject: payload.sub,
        email:
          verified && typeof payload.email === "string"
            ? payload.email.toLowerCase()
            : null,
        name:
          typeof payload.name === "string"
            ? payload.name.slice(0, 60)
            : (input.username ?? "Eventis Explorer"),
      };
    } catch {
      throw AppError.unauthenticated(
        "Unable to verify your sign-in. Please try again.",
      );
    }
    // Provider subject is the identity. Never silently link accounts by matching email.
    const userId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.provider}:${identity.subject}`}))::text`;
      const existing = await tx.externalIdentity.findUnique({
        where: {
          provider_subject: {
            provider: input.provider,
            subject: identity.subject,
          },
        },
      });
      if (existing) return existing.userId;
      if (
        identity.email &&
        (await tx.user.findUnique({ where: { email: identity.email } }))
      ) {
        throw AppError.forbidden(
          "An account already uses this email. Sign in using your existing method.",
        );
      }
      const user = await tx.user.create({
        data: {
          email: identity.email,
          emailVerifiedAt: identity.email ? this.clock.now() : null,
          displayName: identity.name,
          firstName: identity.name,
          externalIdentities: {
            create: { provider: input.provider, subject: identity.subject },
          },
        },
      });
      return user.id;
    });
    return this.session(userId);
  }

  private async session(userId: string) {
    const user = await this.users.findById(userId);
    if (!user || user.status !== "ACTIVE" || user.deletedAt)
      throw AppError.unauthenticated();
    const refresh = this.tokens.issueRefreshToken();
    const roles = toAuthRoles(user);
    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      role: roles[0] ?? "customer",
      roles,
    });
    await this.users.createLoginSession({
      userId,
      refresh: {
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
        familyId: randomUUID(),
      },
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
