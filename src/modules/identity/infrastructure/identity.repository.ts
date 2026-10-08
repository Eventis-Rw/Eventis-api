import { Injectable } from "@nestjs/common";
import type {
  OtpVerification as PrismaOtp,
  User as PrismaUser,
  UserDevice as PrismaDevice,
  RefreshSession as PrismaSession,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { OtpPurpose, OtpRecord } from "../domain/otp.js";
import type { RefreshSession, User, UserDevice } from "../domain/user.js";

@Injectable()
export class OtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    phone: string;
    codeHash: string;
    purpose: OtpPurpose;
    deviceId: string;
    expiresAt: Date;
    firstName?: string;
    accountType?: "POSTER" | "LOVE";
  }): Promise<OtpRecord> {
    const row = await this.prisma.otpVerification.create({
      data: {
        phone: input.phone,
        codeHash: input.codeHash,
        purpose: input.purpose,
        deviceId: input.deviceId,
        firstName: input.firstName ?? null,
        accountType: input.accountType ?? null,
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
    where: { phone?: string; deviceId?: string },
    since: Date,
  ): Promise<number> {
    return this.prisma.otpVerification.count({
      where: {
        ...(where.phone ? { phone: where.phone } : {}),
        ...(where.deviceId ? { deviceId: where.deviceId } : {}),
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

  async findByPhone(phone: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? toUserDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserDomain(row) : null;
  }

  async findDeviceByUserId(
    userId: string,
    deviceId?: string,
  ): Promise<UserDevice | null> {
    const row = await this.prisma.userDevice.findFirst({
      where: {
        userId,
        ...(deviceId ? { deviceId } : {}),
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDeviceDomain(row) : null;
  }

  async findActiveDevicesByUserId(userId: string): Promise<UserDevice[]> {
    const rows = await this.prisma.userDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDeviceDomain);
  }

  async updateDevice(
    userId: string,
    deviceId: string,
    data: Partial<Pick<UserDevice, "deviceName" | "platform" | "osVersion" | "appVersion">>,
  ): Promise<UserDevice | null> {
    const payload: {
      deviceName?: string | null;
      platform?: string | null;
      osVersion?: string | null;
      appVersion?: string | null;
    } = {};

    if (data.deviceName !== undefined) payload.deviceName = data.deviceName ?? null;
    if (data.platform !== undefined) payload.platform = data.platform ?? null;
    if (data.osVersion !== undefined) payload.osVersion = data.osVersion ?? null;
    if (data.appVersion !== undefined) payload.appVersion = data.appVersion ?? null;

    const row = await this.prisma.userDevice.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: payload,
    });
    if (row.count !== 1) return null;
    return this.findDeviceByUserId(userId, deviceId);
  }

  async revokeDevice(userId: string, deviceId: string, now: Date): Promise<UserDevice | null> {
    const row = await this.prisma.userDevice.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (row.count !== 1) return null;
    return this.findDeviceByUserId(userId, deviceId);
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
    deviceId: string;
    refresh: { tokenHash: string; familyId: string; expiresAt: Date };
    now: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userDevice.updateMany({
        where: { userId: input.userId, deviceId: input.deviceId, revokedAt: null },
        data: { lastSeenAt: input.now },
      });
      await tx.refreshSession.create({
        data: {
          userId: input.userId,
          familyId: input.refresh.familyId,
          tokenHash: input.refresh.tokenHash,
          deviceId: input.deviceId,
          expiresAt: input.refresh.expiresAt,
        },
      });
    });
  }

  /**
   * Atomic sign-in after OTP success: verify OTP, upsert user, bind device,
   * create refresh session. Prevents half-created auth state (ADR transaction rule).
   */
  async completeSignIn(input: {
    otpId: string;
    phone: string;
    displayName?: string;
    deviceId: string;
    deviceCredentialHash: string | null;
    registerNewDevice: boolean;
    refresh: {
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
    };
    now: Date;
  }): Promise<{ user: User; deviceRegistered: boolean }> {
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
                  accountType: otp.accountType ?? "LOVE",
                }
              : {}),
            ...(otp.purpose !== "SIGN_UP" && input.displayName
              ? { displayName: input.displayName }
              : {}),
          },
        });
      } else if (userRow.status !== "ACTIVE") {
        throw new Error("user inactive");
      }

      let deviceRegistered = false;
      if (input.registerNewDevice) {
        if (!input.deviceCredentialHash) {
          throw new Error("missing device credential hash");
        }

        const activeCount = await tx.userDevice.count({
          where: { userId: userRow.id, revokedAt: null },
        });
        if (activeCount >= 3) {
          throw new Error("device limit reached");
        }

        const existing = await tx.userDevice.findUnique({
          where: {
            userId_deviceId: {
              userId: userRow.id,
              deviceId: input.deviceId,
            },
          },
        });
        if (existing && existing.revokedAt === null) {
          throw new Error("device already registered");
        }

        await tx.userDevice.upsert({
          where: {
            userId_deviceId: {
              userId: userRow.id,
              deviceId: input.deviceId,
            },
          },
          update: {
            credentialHash: input.deviceCredentialHash,
            lastSeenAt: input.now,
            revokedAt: null,
            updatedAt: input.now,
          },
          create: {
            userId: userRow.id,
            deviceId: input.deviceId,
            credentialHash: input.deviceCredentialHash,
            lastSeenAt: input.now,
          },
        });
        deviceRegistered = true;
      } else {
        await tx.userDevice.updateMany({
          where: { userId: userRow.id, deviceId: input.deviceId, revokedAt: null },
          data: { lastSeenAt: input.now },
        });
      }

      await tx.refreshSession.create({
        data: {
          userId: userRow.id,
          familyId: input.refresh.familyId,
          tokenHash: input.refresh.tokenHash,
          deviceId: input.deviceId,
          expiresAt: input.refresh.expiresAt,
        },
      });

      return { user: toUserDomain(userRow), deviceRegistered };
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
    deviceId: string;
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
          deviceId: input.deviceId,
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
    deviceId: row.deviceId,
    firstName: row.firstName,
    accountType: row.accountType,
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
    organizationName: row.organizationName,
    organizationDescription: row.organizationDescription,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    bio: row.bio,
    location: row.location,
    interestedIn: row.interestedIn,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDeviceDomain(row: PrismaDevice): UserDevice {
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    credentialHash: row.credentialHash,
    deviceName: row.deviceName,
    platform: row.platform,
    osVersion: row.osVersion,
    appVersion: row.appVersion,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    metadata: row.metadata ? (row.metadata as Record<string, unknown>) : null,
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
    deviceId: row.deviceId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
    createdAt: row.createdAt,
  };
}
