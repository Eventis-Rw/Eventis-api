import { Injectable } from "@nestjs/common";
import type {
  AccountDeletionChallenge,
  DeletionChannel,
  Notification,
  NotificationCategory,
  PhoneVerification,
  PhoneVerificationPurpose,
  Prisma,
  PushPlatform,
  PushToken,
  UserNotificationPreference,
  UserPreference,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneVerifiedAt: true,
        deletedAt: true,
        email: true,
      },
    });
  }

  async getPreference(userId: string): Promise<{
    preference: UserPreference | null;
    categoryIds: string[];
  }> {
    const [preference, categories] = await Promise.all([
      this.prisma.userPreference.findUnique({ where: { userId } }),
      this.prisma.userPreferenceCategory.findMany({
        where: { userId },
        select: { categoryId: true },
      }),
    ]);
    return {
      preference,
      categoryIds: categories.map((row) => row.categoryId),
    };
  }

  async upsertPreference(
    userId: string,
    data: {
      preferredLocation?: string | null | undefined;
      latitude?: number | null | undefined;
      longitude?: number | null | undefined;
      language?: string | null | undefined;
    },
  ): Promise<UserPreference> {
    const create: Prisma.UserPreferenceCreateInput = {
      user: { connect: { id: userId } },
      ...(data.preferredLocation !== undefined
        ? { preferredLocation: data.preferredLocation }
        : {}),
      ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      ...(data.language !== undefined ? { language: data.language } : {}),
    };
    const update: Prisma.UserPreferenceUpdateInput = {
      ...(data.preferredLocation !== undefined
        ? { preferredLocation: data.preferredLocation }
        : {}),
      ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      ...(data.language !== undefined ? { language: data.language } : {}),
    };
    return this.prisma.userPreference.upsert({
      where: { userId },
      create,
      update,
    });
  }

  async replacePreferenceCategories(
    userId: string,
    categoryIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userPreferenceCategory.deleteMany({ where: { userId } });
      if (categoryIds.length) {
        await tx.userPreferenceCategory.createMany({
          data: categoryIds.map((categoryId) => ({ userId, categoryId })),
          skipDuplicates: true,
        });
      }
    });
  }

  async getNotificationPreference(
    userId: string,
  ): Promise<UserNotificationPreference | null> {
    return this.prisma.userNotificationPreference.findUnique({
      where: { userId },
    });
  }

  async upsertNotificationPreference(
    userId: string,
    data: {
      eventRecommendations?: boolean | undefined;
      categoryUpdates?: boolean | undefined;
      eventUpdates?: boolean | undefined;
      savedOrganiserUpdates?: boolean | undefined;
      promotional?: boolean | undefined;
    },
  ): Promise<UserNotificationPreference> {
    const values = definedOnly(data) as {
      eventRecommendations?: boolean;
      categoryUpdates?: boolean;
      eventUpdates?: boolean;
      savedOrganiserUpdates?: boolean;
      promotional?: boolean;
    };
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...values },
      update: values,
    });
  }

  async listNotifications(params: {
    userId: string;
    skip: number;
    take: number;
    unreadOnly: boolean;
    category?: NotificationCategory | undefined;
  }): Promise<{ items: Notification[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId: params.userId,
      ...(params.unreadOnly ? { readAt: null } : {}),
      ...(params.category ? { category: params.category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  async markNotificationRead(
    userId: string,
    id: string,
    readAt: Date,
  ): Promise<Notification | null> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) return null;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? readAt },
    });
  }

  async markAllNotificationsRead(
    userId: string,
    readAt: Date,
  ): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt },
    });
    return result.count;
  }

  async registerPushToken(input: {
    userId: string;
    token: string;
    platform: PushPlatform;
    now: Date;
  }): Promise<PushToken> {
    return this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: {
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        lastSeenAt: input.now,
      },
      update: {
        userId: input.userId,
        platform: input.platform,
        lastSeenAt: input.now,
      },
    });
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  async findLatestPhoneVerification(
    userId: string,
    purpose: PhoneVerificationPurpose,
  ): Promise<PhoneVerification | null> {
    return this.prisma.phoneVerification.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPhoneVerification(input: {
    userId: string;
    phone: string;
    codeHash: string;
    purpose: PhoneVerificationPurpose;
    expiresAt: Date;
  }): Promise<PhoneVerification> {
    return this.prisma.phoneVerification.create({ data: input });
  }

  async findPhoneVerification(
    userId: string,
    id: string,
  ): Promise<PhoneVerification | null> {
    return this.prisma.phoneVerification.findFirst({
      where: { id, userId },
    });
  }

  async incrementPhoneVerificationAttempts(id: string): Promise<void> {
    await this.prisma.phoneVerification.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async verifyPhone(
    userId: string,
    id: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id },
        data: { verifiedAt: now },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { phoneVerifiedAt: now },
      }),
      this.prisma.userPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
    ]);
  }

  async createDeletionChallenge(input: {
    userId: string;
    channel: DeletionChannel;
    codeHash: string;
    expiresAt: Date;
  }): Promise<AccountDeletionChallenge> {
    return this.prisma.accountDeletionChallenge.create({ data: input });
  }

  async findDeletionChallenge(
    userId: string,
    id: string,
  ): Promise<AccountDeletionChallenge | null> {
    return this.prisma.accountDeletionChallenge.findFirst({
      where: { id, userId },
    });
  }

  async incrementDeletionAttempts(id: string): Promise<void> {
    await this.prisma.accountDeletionChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async deleteAccount(userId: string, id: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.accountDeletionChallenge.update({
        where: { id },
        data: { verifiedAt: now },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          status: "INACTIVE",
          username: null,
          activeOrganisationId: null,
          phone: `deleted:${userId.replaceAll("-", "").slice(0, 16)}`,
          email: null,
        },
      }),
      this.prisma.refreshSession.deleteMany({ where: { userId } }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
    ]);
  }
}

function definedOnly<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
