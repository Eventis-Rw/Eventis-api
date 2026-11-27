import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import { Clock } from "../../../common/clock.js";
import { ChatService } from "../../chat/index.js";
import type { ConversationStatus, ConversationType } from "../../chat/domain/chat.js";
import type { MessagingService } from "../../chat/domain/messaging-policy.js";

/**
 * Admin Chat Management: wraps the chat module's domain logic with the
 * audit-log trail every admin mutation needs. Reads go straight to ChatService;
 * writes call ChatService for the actual mutation, then record the action.
 */
@Injectable()
export class ChatManagementService {
  constructor(
    private readonly chat: ChatService,
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  overview(service?: MessagingService) {
    return this.chat.adminOverview(service);
  }

  listConversations(input: {
    type?: ConversationType | undefined;
    status?: ConversationStatus | undefined;
    query?: string | undefined;
    service?: MessagingService | undefined;
    page: number;
    limit: number;
  }) {
    return this.chat.adminListConversations(input);
  }

  getConversation(id: string) {
    return this.chat.adminGetConversation(id);
  }

  async setConversationStatus(
    id: string,
    status: ConversationStatus,
    actorId: string,
    reason: string,
  ) {
    const before = await this.chat.adminGetConversation(id);
    const result = await this.chat.adminSetConversationStatus(id, status);
    await this.recordAudit({
      actorId,
      action: "chat.admin.conversation.status",
      subjectType: "Conversation",
      subjectId: id,
      changes: { from: before.status, to: status, reason },
    });
    return result;
  }

  async removeMember(id: string, targetUserId: string, actorId: string, reason: string) {
    const result = await this.chat.adminRemoveMember(id, targetUserId);
    await this.recordAudit({
      actorId,
      action: "chat.admin.member.remove",
      subjectType: "ConversationParticipant",
      subjectId: id,
      changes: { targetUserId, reason },
    });
    return result;
  }

  async transferOwnership(id: string, toUserId: string, actorId: string, reason: string) {
    const result = await this.chat.adminTransferOwnership(id, toUserId);
    await this.recordAudit({
      actorId,
      action: "chat.admin.group.transfer_ownership",
      subjectType: "Conversation",
      subjectId: id,
      changes: { toUserId, reason },
    });
    return result;
  }

  // ---------- Reports (extends the existing UserReport workflow for chat) ----------

  async listReports(input: { status?: string | undefined }) {
    const rows = await this.db.userReport.findMany({
      where: input.status ? { status: input.status as never } : {},
      include: {
        conversation: { select: { id: true, type: true, title: true } },
        reported: { select: { id: true, displayName: true, username: true } },
        reporter: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.messageId
        ? "message"
        : row.conversation?.type === "GROUP"
          ? "group"
          : row.conversationId
            ? "conversation"
            : "user",
      targetLabel:
        row.conversation?.title ??
        row.reported?.displayName ??
        row.reported?.username ??
        "Unknown",
      targetId: row.conversationId ?? row.reportedUserId,
      reporterId: row.reporterId,
      reporterLabel: row.reporter.displayName ?? row.reporter.username,
      category: row.category,
      reason: row.reason,
      details: row.details ?? "",
      status: row.status,
      assignedTo: row.assignedTo,
      moderatorNotes: row.moderatorNotes,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async assignReport(id: string, assigneeId: string, actorId: string) {
    const row = await this.db.userReport.update({
      where: { id },
      data: { assignedTo: assigneeId, status: "UNDER_REVIEW" },
    });
    await this.recordAudit({
      actorId,
      action: "chat.admin.report.assign",
      subjectType: "UserReport",
      subjectId: id,
      changes: { assignedTo: assigneeId },
    });
    return { id: row.id };
  }

  async addReportNote(id: string, note: string, actorId: string) {
    const existing = await this.db.userReport.findUnique({ where: { id } });
    if (!existing) throw new Error("Report not found");
    const notes = existing.moderatorNotes
      ? `${existing.moderatorNotes}\n---\n${note}`
      : note;
    await this.db.userReport.update({
      where: { id },
      data: { moderatorNotes: notes },
    });
    await this.recordAudit({
      actorId,
      action: "chat.admin.report.note",
      subjectType: "UserReport",
      subjectId: id,
      changes: { note },
    });
    return { id };
  }

  async actionReport(
    id: string,
    outcome: "ACTIONED" | "DISMISSED",
    actorId: string,
    reason: string,
  ) {
    const row = await this.db.userReport.update({
      where: { id },
      data: {
        status: outcome,
        reviewedBy: actorId,
        reviewedAt: this.clock.now(),
      },
    });
    await this.recordAudit({
      actorId,
      action: "chat.admin.report.decide",
      subjectType: "UserReport",
      subjectId: id,
      changes: { outcome, reason },
    });
    return { id: row.id };
  }

  private async recordAudit(input: {
    actorId: string;
    action: string;
    subjectType: string;
    subjectId: string;
    changes: Prisma.InputJsonObject;
  }) {
    await this.db.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: "admin",
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        changes: input.changes,
      },
    });
  }
}
