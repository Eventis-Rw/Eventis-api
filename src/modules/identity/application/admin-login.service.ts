import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  getDummyAdminPasswordHash,
  verifyAdminPassword,
} from "../domain/admin-password.js";
import { AdminAuthRepository } from "../infrastructure/admin-auth.repository.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";
import {
  toAuthRoles,
  toAuthSession,
  toAuthTokens,
} from "../mappers/auth.mapper.js";

@Injectable()
export class AdminLoginService {
  constructor(
    private readonly credentials: AdminAuthRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}
  async execute(input: { email: string; password: string }, ip: string) {
    const email = input.email.trim().toLowerCase();
    await this.credentials.consumeAttempt(email, ip, this.clock.now());
    const credential = await this.credentials.findCredential(email);
    const hash =
      credential?.adminPasswordHash ?? (await getDummyAdminPasswordHash());
    const valid = await verifyAdminPassword(input.password, hash);
    if (
      !valid ||
      !credential?.adminPasswordHash ||
      credential.role !== "ADMIN" ||
      credential.status !== "ACTIVE" ||
      credential.deletedAt
    ) {
      throw AppError.unauthenticated(
        "Unable to sign in with these credentials.",
      );
    }
    const user = await this.users.findById(credential.id);
    if (
      !user ||
      user.role !== "ADMIN" ||
      user.status !== "ACTIVE" ||
      user.deletedAt
    ) {
      throw AppError.unauthenticated(
        "Unable to sign in with these credentials.",
      );
    }
    const roles = toAuthRoles(user);
    const refresh = this.tokens.issueRefreshToken();
    const access = await this.tokens.issueAccessToken({
      sub: user.id,
      role: roles[0] ?? "admin",
      roles,
    });
    await this.users.createLoginSession({
      userId: user.id,
      refresh: {
        tokenHash: refresh.tokenHash,
        familyId: randomUUID(),
        expiresAt: refresh.expiresAt,
      },
    });
    await this.credentials.clearEmailAttempts(email);
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
