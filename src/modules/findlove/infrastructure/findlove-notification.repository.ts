import { Injectable } from "@nestjs/common";
import type { Notification, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

/**
 * FindLove notifications live in the shared notifications table under the
 * FINDLOVE category. Every query here is limited to that category, so the
 * FindLove feed never shows (or marks read) Eventis notifications.
 */
@Injectable()
export class FindLoveNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data: Prisma.InputJsonObject;
  }): Promise<Notification> {
    return this.prisma.notification.create({
      data: { ...input, category: "FINDLOVE" },
    });
  }

  async list(params: {
    userId: string;
    skip: number;
    take: number;
    unreadOnly: boolean;
  }): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const mine: Prisma.NotificationWhereInput = { userId: params.userId, category: "FINDLOVE" };
    const where: Prisma.NotificationWhereInput = params.unreadOnly ? { ...mine, readAt: null } : mine;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...mine, readAt: null } }),
    ]);
    return { items, total, unreadCount };
  }

  async markRead(userId: string, id: string, readAt: Date): Promise<Notification | null> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId, category: "FINDLOVE" },
    });
    if (!existing) return null;
    if (existing.readAt) return existing;
    return this.prisma.notification.update({ where: { id }, data: { readAt } });
  }

  async markAllRead(userId: string, readAt: Date): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, category: "FINDLOVE", readAt: null },
      data: { readAt },
    });
    return result.count;
  }
}
