import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import { EmailService } from "../../../infrastructure/email/email.service.js";
import { OrganisationsService } from "../../organisations/index.js";

type ApplicationInput = {
  name: string;
  description: string;
  activities: string;
  location: string;
  website?: string | null | undefined;
};

@Injectable()
export class OrganiserApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organisations: OrganisationsService,
    private readonly emails: EmailService,
    private readonly clock: Clock,
  ) {}

  async mine(userId: string) {
    return this.prisma.organiserApplication.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async create(userId: string, input: ApplicationInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { accountType: true } });
      if (user.accountType === "POSTER") throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "You already have organiser access.");
      const open = await tx.organiserApplication.findFirst({
        where: { userId, status: { in: ["PENDING_PAYMENT", "IN_REVIEW"] } },
      });
      if (open) throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "You already have an organiser application in progress.");
      const pendingPayment = await tx.manualPaymentSubmission.findFirst({
        where: { userId, platform: "ORGANISER", status: { in: ["PENDING", "UNDER_REVIEW"] } },
        orderBy: { createdAt: "desc" },
      });
      return tx.organiserApplication.create({
        data: {
          userId,
          name: input.name,
          description: input.description,
          activities: input.activities,
          location: input.location,
          website: input.website ?? null,
          manualPaymentId: pendingPayment?.id ?? null,
        },
      });
    });
  }

  async list(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.organiserApplication.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.organiserApplication.count(),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: items.map((item) => item.userId) } },
      select: { id: true, displayName: true, email: true, phone: true },
    });
    const payments = await this.prisma.manualPaymentSubmission.findMany({
      where: { id: { in: items.flatMap((item) => item.manualPaymentId ? [item.manualPaymentId] : []) } },
    });
    return {
      items: items.map((item) => {
        const payment = payments.find((row) => row.id === item.manualPaymentId);
        return {
          ...item,
          user: users.find((user) => user.id === item.userId) ?? null,
          payment: payment ? {
            id: payment.id, reference: payment.reference, status: payment.status,
            amountMinor: payment.amountMinor.toString(), currency: payment.currency,
            plan: payment.planSnapshot, paymentMethod: payment.paymentMethodSnapshot,
            verifiedTransactionId: payment.verifiedTransactionId,
            receiptUploadId: payment.receiptUploadId, reviewedAt: payment.reviewedAt,
          } : null,
        };
      }),
      page, limit, total,
    };
  }

  async paymentVerified(paymentId: string, userId: string, tx: Prisma.TransactionClient) {
    const now = this.clock.now();
    const updated = await tx.organiserApplication.updateMany({
      where: { userId, manualPaymentId: paymentId, status: "PENDING_PAYMENT" },
      data: { status: "IN_REVIEW", submittedAt: now },
    });
    if (updated.count !== 1) {
      throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "The applicant must complete the organiser application before payment can be verified.");
    }
    await tx.notification.create({
      data: {
        userId, category: "ORGANIZERS", type: "organiser_application_in_review",
        title: "Organiser application in review",
        body: "Your payment was verified and your organiser application is awaiting administrator review.",
        dedupeKey: `organiser-application-payment:${paymentId}`,
      },
    });
  }

  async review(id: string, actorId: string, decision: "APPROVED" | "REJECTED", rejectionReason?: string) {
    if (decision === "REJECTED" && !rejectionReason?.trim()) {
      throw AppError.validation({ rejectionReason: ["A rejection reason is required."] });
    }
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const app = await tx.organiserApplication.findUnique({ where: { id } });
      if (!app) throw AppError.notFound("That organiser application");
      const changed = await tx.organiserApplication.updateMany({
        where: { id, status: "IN_REVIEW" },
        data: { status: decision, reviewedAt: now, reviewedBy: actorId, rejectionReason: decision === "REJECTED" ? rejectionReason ?? null : null },
      });
      if (!changed.count) {
        const current = await tx.organiserApplication.findUniqueOrThrow({ where: { id } });
        if (current.status === decision) return { app: current, changed: false };
        throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "Only applications in review can be decided.");
      }
      const payment = app.manualPaymentId ? await tx.manualPaymentSubmission.findUnique({ where: { id: app.manualPaymentId } }) : null;
      if (!payment || payment.status !== "APPROVED" || payment.userId !== app.userId || payment.platform !== "ORGANISER" || !payment.organiserPlanId) {
        throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "The application does not have a verified organiser payment.");
      }
      if (decision === "APPROVED") {
        const snapshot = payment.planSnapshot;
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Invalid organiser payment plan snapshot");
        const durationDays = snapshot.durationDays;
        const postQuota = snapshot.postQuota;
        if (typeof durationDays !== "number" || (postQuota !== null && typeof postQuota !== "number")) throw new Error("Invalid organiser payment plan terms");
        await this.organisations.activateFromManualPayment(app.userId, payment.organiserPlanId, now, tx, {
          durationDays, postQuota, priceMinor: payment.amountMinor,
        });
        const org = await tx.organisation.create({
          data: { ownerId: app.userId, name: app.name, description: app.description, activities: app.activities, location: app.location, website: app.website },
        });
        await tx.organisationMember.create({ data: { organisationId: org.id, userId: app.userId, role: "OWNER" } });
        await tx.user.update({ where: { id: app.userId }, data: { activeOrganisationId: org.id } });
      }
      await tx.auditLog.create({
        data: { actorId, actorRole: "admin", action: `organiser.application.${decision.toLowerCase()}`, subjectType: "OrganiserApplication", subjectId: id, changes: { reason: rejectionReason ?? null, paymentId: payment.id } },
      });
      await tx.notification.create({
        data: {
          userId: app.userId, category: "ORGANIZERS", type: `organiser_application_${decision.toLowerCase()}`,
          title: decision === "APPROVED" ? "Organiser application approved" : "Organiser application rejected",
          body: decision === "APPROVED" ? "Your organiser account is approved. You can now open your dashboard." : `Your organiser application was rejected: ${rejectionReason}`,
          dedupeKey: `organiser-application-decision:${id}`,
        },
      });
      return { app: await tx.organiserApplication.findUniqueOrThrow({ where: { id } }), changed: true };
    });
    if (result.changed) {
      const user = await this.prisma.user.findUnique({ where: { id: result.app.userId }, select: { email: true } });
      if (user?.email) void this.emails.sendBestEffort({
        to: user.email,
        subject: decision === "APPROVED" ? "Your organiser application was approved" : "Your organiser application was rejected",
        html: decision === "APPROVED"
          ? "<p>Your organiser account was approved. Open Eventis to access your dashboard.</p>"
          : "<p>Your organiser application was rejected. Open Eventis to see the reason and next steps.</p>",
      });
    }
    return result.app;
  }
}
