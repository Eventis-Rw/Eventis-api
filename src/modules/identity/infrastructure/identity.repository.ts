import { Injectable } from "@nestjs/common";
import type {
  OtpVerification as PrismaOtp,
  User as PrismaUser,
  RefreshSession as PrismaSession,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { OtpPurpose, OtpRecord } from "../domain/otp.js";
import type { RefreshSession, User } from "../domain/user.js";

@Injectable()
export class OtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    phone: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    firstName?: string;
    accountType?: "POSTER" | "CUSTOMER";
    pinHash?: string;
  }): Promise<OtpRecord> {
    const row = await this.prisma.otpVerification.create({
      data: {
        phone: input.phone,
        codeHash: input.codeHash,
        purpose: input.purpose,
        firstName: input.firstName ?? null,
        accountType: input.accountType ?? null,
        pinHash: input.pinHash ?? null,
        expiresAt: input.expiresAt,
      },
    });
    return toOtpDomain(row);
  }

  async findLatestActive(
    phone: string,
    purpose?: OtpPurpose,
  ): Promise<OtpRecord | null> {
    const row = await this.prisma.otpVerification.findFirst({
      where: { phone, ...(purpose ? { purpose } : {}), verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row ? toOtpDomain(row) : null;
  }

  async findLatestAny(
    phone: string,
    purpose?: OtpPurpose,
  ): Promise<OtpRecord | null> {
    const row = await this.prisma.otpVerification.findFirst({
      where: { phone, ...(purpose ? { purpose } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return row ? toOtpDomain(row) : null;
  }

  async countSince(
    where: { phone?: string },
    since: Date,
  ): Promise<number> {
    return this.prisma.otpVerification.count({
      where: {
        ...(where.phone ? { phone: where.phone } : {}),
        createdAt: { gte: since },
      },
    });
  }

  async incrementAttempts(id: string): Promise<OtpRecord> {
    const row = await this.prisma.otpVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    return toOtpDomain(row);
  }

  async markVerified(id: string, verifiedAt: Date): Promise<void> {
    await this.prisma.otpVerification.update({
      where: { id },
      data: { verifiedAt },
    });
  }
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toUserDomain);
  }

  async findByPhone(phone: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? toUserDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserDomain(row) : null;
  }

  async setPinHash(userId: string, pinHash: string): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash },
    });
    return toUserDomain(row);
  }

  async setStatus(userId: string, status: "ACTIVE" | "INACTIVE"): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: { status },
      });
      if (status === "INACTIVE") {
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return toUserDomain(row);
    });
  }

  async updateProfile(
    userId: string,
    data: Partial<
      Pick<
        User,
        | "firstName"
        | "lastName"
        | "displayName"
        | "email"
        | "avatarUrl"
        | "accountType"
        | "organizationName"
        | "organizationDescription"
        | "dateOfBirth"
        | "gender"
        | "bio"
        | "location"
        | "interestedIn"
      >
    >,
  ): Promise<User> {
    const row = await this.prisma.user.update({ where: { id: userId }, data });
    return toUserDomain(row);
  }

  async createLoginSession(input: {
    userId: string;
    refresh: { tokenHash: string; familyId: string; expiresAt: Date };
  }): Promise<void> {
    await this.prisma.refreshSession.create({
      data: {
        userId: input.userId,
        familyId: input.refresh.familyId,
        tokenHash: input.refresh.tokenHash,
        expiresAt: input.refresh.expiresAt,
      },
    });
  }
  async completeSignIn(input: {
    otpId: string;
    phone: string;
    displayName?: string;
    pinHash?: string;
    refresh: {
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
    };
    now: Date;
  }): Promise<{ user: User }> {
    return this.prisma.$transaction(async (tx) => {
      const otp = await tx.otpVerification.findUnique({
        where: { id: input.otpId },
      });
      if (!otp || otp.verifiedAt !== null) {
        throw new Error("otp already used");
      }
      const claimedOtp = await tx.otpVerification.updateMany({
        where: { id: input.otpId, verifiedAt: null },
        data: { verifiedAt: input.now },
      });
      if (claimedOtp.count !== 1) throw new Error("otp already used");

      let userRow = await tx.user.findUnique({ where: { phone: input.phone } });
      if (userRow && otp.purpose === "SIGN_UP") {
        throw new Error("phone already registered");
      }
      if (!userRow) {
        if (otp.purpose === "SIGN_UP" && (!otp.firstName || !otp.accountType)) {
          throw new Error("signup information missing");
        }
        userRow = await tx.user.create({
          data: {
            phone: input.phone,
            status: "ACTIVE",
            ...(otp.purpose === "SIGN_UP"
              ? {
                  firstName: otp.firstName,
                  displayName: otp.firstName,
                  accountType: otp.accountType ?? "CUSTOMER",
                }
              : {}),
            ...(otp.purpose !== "SIGN_UP" && input.displayName
              ? { displayName: input.displayName }
              : {}),
            ...(input.pinHash ? { pinHash: input.pinHash } : {}),
          },
        });
      } else if (userRow.status !== "ACTIVE") {
        throw new Error("user inactive");
      } else if (input.pinHash) {
        userRow = await tx.user.update({
          where: { id: userRow.id },
          data: { pinHash: input.pinHash },
        });
      }

      await tx.refreshSession.create({
        data: {
          userId: userRow.id,
          familyId: input.refresh.familyId,
          tokenHash: input.refresh.tokenHash,
          expiresAt: input.refresh.expiresAt,
        },
      });

      return { user: toUserDomain(userRow) };
    });
  }
}

@Injectable()
export class RefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const row = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });
    return row ? toSessionDomain(row) : null;
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /**
   * Rotate: mark old session replaced, insert new hash in the same family.
   * If the presented session was already replaced, caller must revoke the family.
   */
  async rotate(input: {
    oldSessionId: string;
    userId: string;
    familyId: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<RefreshSession> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshSession.create({
        data: {
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.newTokenHash,
          expiresAt: input.expiresAt,
        },
      });
      await tx.refreshSession.update({
        where: { id: input.oldSessionId },
        data: {
          replacedById: created.id,
          revokedAt: input.now,
        },
      });
      return toSessionDomain(created);
    });
  }
}

function toOtpDomain(row: PrismaOtp): OtpRecord {
  return {
    id: row.id,
    phone: row.phone,
    codeHash: row.codeHash,
    purpose: row.purpose,
    firstName: row.firstName,
    accountType: row.accountType,
    pinHash: row.pinHash,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
  };
}

function toUserDomain(row: PrismaUser): User {
  return {
    id: row.id,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    accountType: row.accountType,
    role: row.role,
    organizationName: row.organizationName,
    organizationDescription: row.organizationDescription,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    bio: row.bio,
    location: row.location,
    interestedIn: row.interestedIn,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    pinHash: row.pinHash,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSessionDomain(row: PrismaSession): RefreshSession {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
    createdAt: row.createdAt,
  };
}
