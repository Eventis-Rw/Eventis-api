import { Injectable } from "@nestjs/common";
import { type SupportCategory } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
const categories: Record<SupportCategory, string> = {
  EVENTS: "technical_problems",
  PAYMENTS: "payment_problems",
  ACCOUNT: "account_access",
  SAFETY: "abuse_harassment",
  BUG: "technical_problems",
  OTHER: "technical_problems",
};
@Injectable()
export class AdminDashboardRepository {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}
  async photos() {
    const photos = await this.db.loveProfilePhoto.findMany({
      include: { profile: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });
    return photos.map((p) => ({
      id: p.id,
      userId: p.profile.userId,
      userName: p.profile.user.displayName ?? p.profile.username,
      url: this.storage.getPublicUrl(p.key),
      type: p.isPrimary ? "profile" : "gallery",
      status: p.moderationStatus,
      uploadedAt: p.createdAt.toISOString(),
      reason: p.moderationReason ?? undefined,
      reviewer: p.reviewedBy ?? undefined,
      reviewedAt: p.reviewedAt?.toISOString(),
    }));
  }
  async moderate(
    id: string,
    status: "approved" | "rejected",
    reason: string,
    actorId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const previous = await tx.loveProfilePhoto.findUnique({ where: { id } });
      if (!previous) throw AppError.notFound("Photo");
      await tx.loveProfilePhoto.update({
        where: { id },
        data: {
          moderationStatus: status,
          moderationReason: reason,
          reviewedBy: actorId,
          reviewedAt: this.clock.now(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: "admin",
          action: "findlove.admin.photo",
          subjectType: "LoveProfilePhoto",
          subjectId: id,
          changes: { from: previous.moderationStatus, to: status, reason },
        },
      });
      return { success: true };
    });
  }
  async support() {
    const rows = await this.db.supportReport.findMany({
      where: { user: { loveProfile: { isNot: null } } },
      include: { user: true, messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      ticketNumber: r.reference ?? `FL-${r.id.slice(0, 8)}`,
      userId: r.userId,
      userName: r.user.displayName ?? r.user.phone,
      subject: r.description.slice(0, 100),
      category: categories[r.category],
      priority: r.category === "SAFETY" ? "high" : "normal",
      status: r.status.toLowerCase(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      messages: [
        {
          id: r.id,
          senderName: r.user.displayName ?? r.user.phone,
          isStaff: false,
          content: r.description,
          timestamp: r.createdAt.toISOString(),
        },
        ...r.messages
          .filter((m) => !m.internal)
          .map((m) => ({
            id: m.id,
            senderName: m.actorName,
            isStaff: true,
            content: m.content,
            timestamp: m.createdAt.toISOString(),
          })),
      ],
      internalNotes: r.messages
        .filter((m) => m.internal)
        .map((m) => ({
          id: m.id,
          authorName: m.actorName,
          note: m.content,
          timestamp: m.createdAt.toISOString(),
        })),
    }));
  }
  async updateSupport(
    input: {
      id: string;
      status?: "open" | "in_progress" | "resolved" | undefined;
      reply?: string | undefined;
      note?: string | undefined;
      requestId: string;
    },
    actorId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const report = await tx.supportReport.findFirst({
        where: { id: input.id, user: { loveProfile: { isNot: null } } },
      });
      if (!report) throw AppError.notFound("Support ticket");
      const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
      const actorName = actor.displayName ?? actor.phone;
      if (input.reply || input.note) {
        const existing = await tx.adminSupportMessage.findUnique({
          where: { requestId: input.requestId },
        });
        if (existing) {
          if (
            existing.actorId !== actorId ||
            existing.reportId !== input.id ||
            existing.content !== (input.reply ?? input.note) ||
            existing.internal !== !!input.note
          )
            throw AppError.validation({
              requestId: ["Request ID was already used"],
            });
          return { success: true };
        }
        await tx.adminSupportMessage.create({
          data: {
            reportId: input.id,
            actorId,
            actorName,
            content: (input.reply ?? input.note)!,
            internal: !!input.note,
            requestId: input.requestId,
          },
        });
        if (input.reply)
          await tx.notification.create({
            data: {
              userId: report.userId,
              category: "FINDLOVE",
              type: "support_reply",
              title: "Support replied to your request",
              body: input.reply,
              data: { supportReportId: report.id },
            },
          });
      }
      if (input.status)
        await tx.supportReport.update({
          where: { id: input.id },
          data: {
            status:
              input.status === "open"
                ? "OPEN"
                : input.status === "in_progress"
                  ? "IN_PROGRESS"
                  : "RESOLVED",
          },
        });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: "admin",
          action: "findlove.admin.support",
          subjectType: "SupportReport",
          subjectId: report.id,
          changes: {
            operation: input.reply
              ? "reply"
              : input.note
                ? "internal_note"
                : "status",
            status: input.status ?? report.status,
          },
        },
      });
      return { success: true };
    });
  }
  async staff() {
    const users = await this.db.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.displayName ?? u.phone,
      email: u.email ?? u.phone,
      role: "super_admin",
      roleLabel: "Administrator",
      canViewDocuments: true,
      canChangePricing: true,
      canRefundPayments: true,
      canSuspendUsers: true,
      status: u.status === "ACTIVE" ? "active" : "suspended",
      lastActiveAt: (u.lastSeenAt ?? u.updatedAt).toISOString(),
    }));
  }
  async notifications() {
    const templates = await this.db.adminNotificationTemplate.findMany({
      orderBy: { id: "asc" },
    });
    const since = new Date(this.clock.now().getTime() - 30 * 86400000);
    const sent = await this.db.notification.count({
      where: {
        category: "FINDLOVE",
        type: { not: "admin_template_preview" },
        createdAt: { gte: since },
      },
    });
    return {
      templates: templates.map((t) => ({
        ...t,
        sentCount: 0,
        deliveredRate: "N/A",
      })),
      stats: { sent, deliveryRate: "N/A", reminders: 0 },
    };
  }
  async preview(id: string, actorId: string) {
    const template = await this.db.adminNotificationTemplate.findUnique({
      where: { id },
    });
    if (!template) throw AppError.notFound("Notification template");
    await this.db.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          userId: actorId,
          category: "FINDLOVE",
          type: "admin_template_preview",
          title: template.name,
          body: template.content,
          data: { templateId: id, preview: true },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: "admin",
          action: "findlove.admin.notification_preview",
          subjectType: "NotificationTemplate",
          changes: { templateId: id },
        },
      });
    });
    return {
      success: true,
      message: "Preview saved to your in-app notification inbox.",
    };
  }
  async audit() {
    const rows = await this.db.auditLog.findMany({
      orderBy: { id: "desc" },
      take: 2000,
    });
    const actors = await this.db.user.findMany({
      where: {
        id: {
          in: rows
            .map((r) => r.actorId)
            .filter((id): id is string => id !== null),
        },
      },
      select: { id: true, displayName: true, phone: true },
    });
    return rows.map((r) => ({
      id: String(r.id),
      actorId: r.actorId ?? "system",
      actorName:
        actors.find((a) => a.id === r.actorId)?.displayName ??
        actors.find((a) => a.id === r.actorId)?.phone ??
        "System",
      action: r.action,
      target: `${r.subjectType}${r.subjectId ? ` · ${r.subjectId}` : ""}`,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  async reports() {
    const rows = await this.db.eventReport.findMany({
      include: { event: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      type: "event",
      targetLabel: r.event.title,
      targetId: r.eventId,
      reporterId: r.reporterId,
      reason: r.reason,
      details: r.details ?? "",
      status:
        r.status === "OPEN"
          ? "open"
          : r.status === "DISMISSED"
            ? "dismissed"
            : "resolved",
      createdAt: r.createdAt.toISOString(),
    }));
  }
  async resolve(
    id: string,
    outcome: "resolved" | "dismissed",
    actorId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.eventReport.findUnique({ where: { id } });
      if (!row) throw AppError.notFound("Event report");
      await tx.eventReport.update({
        where: { id },
        data: {
          status: outcome === "resolved" ? "REVIEWED" : "DISMISSED",
          reviewedBy: actorId,
          reviewedAt: this.clock.now(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: "admin",
          action: "eventis.admin.report",
          subjectType: "EventReport",
          subjectId: id,
          changes: { from: row.status, to: outcome },
        },
      });
      return { success: true };
    });
  }
}
