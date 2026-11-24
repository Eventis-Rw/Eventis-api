import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@eventis/contracts";
import { AppError } from "../../../common/errors/app-error.js";
import type {
  ManualPaymentMethod as PrismaManualPaymentMethod,
  ManualPaymentSubmission as PrismaManualPaymentSubmission,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  OPEN_MANUAL_PAYMENT_STATUSES,
  type ManualPaymentMethod,
  type ManualPaymentMethodPlatform,
  type ManualPaymentMethodSnapshot,
  type ManualPaymentPlanSnapshot,
  type ManualPaymentPlatform,
  type ManualPaymentStatus,
  type ManualPaymentSubmission,
  type ManualPaymentSubmissionWithUser,
} from "../domain/manual-payment.js";
import type { PaymentMethod } from "../domain/payment.js";

function toMethodDomain(row: PrismaManualPaymentMethod): ManualPaymentMethod {
  return {
    id: row.id,
    provider: row.provider,
    platform: row.platform,
    accountName: row.accountName,
    phoneNumber: row.phoneNumber,
    instructions: row.instructions,
    currency: row.currency,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSubmissionDomain(
  row: PrismaManualPaymentSubmission,
): ManualPaymentSubmission {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.userId,
    platform: row.platform,
    installmentPlanId: row.installmentPlanId,
    organiserPlanId: row.organiserPlanId,
    planSnapshot: row.planSnapshot as unknown as ManualPaymentPlanSnapshot,
    amountMinor: row.amountMinor,
    currency: row.currency,
    paymentMethodId: row.paymentMethodId,
    paymentMethodSnapshot:
      row.paymentMethodSnapshot as unknown as ManualPaymentMethodSnapshot,
    receiptUploadId: row.receiptUploadId,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ManualPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Payment methods (admin-configured numbers) -----------------------

  async createMethod(input: {
    provider: PaymentMethod;
    platform: ManualPaymentMethodPlatform;
    accountName: string | null;
    phoneNumber: string;
    instructions: string | null;
    currency: string;
    isActive: boolean;
    displayOrder: number;
  }): Promise<ManualPaymentMethod> {
    const row = await this.prisma.manualPaymentMethod.create({ data: input });
    return toMethodDomain(row);
  }

  /**
   * `filter.platform` asks for one product's methods: a method scoped to
   * that exact platform, or one scoped to BOTH, qualifies either way.
   */
  async listMethods(filter: {
    platform?: ManualPaymentPlatform | undefined;
    activeOnly: boolean;
  }): Promise<ManualPaymentMethod[]> {
    const rows = await this.prisma.manualPaymentMethod.findMany({
      where: {
        ...(filter.platform
          ? { platform: { in: [filter.platform, "BOTH"] } }
          : {}),
        ...(filter.activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toMethodDomain);
  }

  async findMethodById(id: string): Promise<ManualPaymentMethod | null> {
    const row = await this.prisma.manualPaymentMethod.findUnique({
      where: { id },
    });
    return row ? toMethodDomain(row) : null;
  }

  async updateMethod(
    id: string,
    patch: Partial<{
      provider: PaymentMethod;
      platform: ManualPaymentMethodPlatform;
      accountName: string | null;
      phoneNumber: string;
      instructions: string | null;
      currency: string;
      isActive: boolean;
      displayOrder: number;
    }>,
  ): Promise<ManualPaymentMethod | null> {
    try {
      const row = await this.prisma.manualPaymentMethod.update({
        where: { id },
        data: patch,
      });
      return toMethodDomain(row);
    } catch {
      return null;
    }
  }

  /** Refuses (returns false) when any submission still references this method, to preserve history. */
  async deleteMethod(id: string): Promise<boolean> {
    const inUse = await this.prisma.manualPaymentSubmission.count({
      where: { paymentMethodId: id },
    });
    if (inUse > 0) return false;
    try {
      await this.prisma.manualPaymentMethod.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async findUserContact(
    userId: string,
  ): Promise<{ email: string | null; displayName: string | null } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
  }

  /** Confirms a receipt upload belongs to this user and is the right purpose, before it's attached to a submission. */
  async findReceiptUpload(
    id: string,
    userId: string,
  ): Promise<{ id: string; purpose: string } | null> {
    const row = await this.prisma.upload.findUnique({ where: { id } });
    if (!row || row.userId !== userId) return null;
    return { id: row.id, purpose: row.purpose };
  }

  // ---- Submissions --------------------------------------------------------

  async nextManualPaymentReference(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ value: string }>>`
      SELECT nextval('manual_payment_reference_seq')::text AS value
    `;
    const value = rows[0]?.value;
    if (!value)
      throw new Error("Manual payment reference sequence is unavailable");
    return `MPAY-${value}`;
  }

  /** One open (PENDING/UNDER_REVIEW) submission per user per platform at a time. */
  async findOpenSubmissionForUser(
    userId: string,
    platform: ManualPaymentPlatform,
  ): Promise<ManualPaymentSubmission | null> {
    const row = await this.prisma.manualPaymentSubmission.findFirst({
      where: {
        userId,
        platform,
        status: { in: [...OPEN_MANUAL_PAYMENT_STATUSES] },
      },
    });
    return row ? toSubmissionDomain(row) : null;
  }

  async createSubmission(input: {
    reference: string;
    userId: string;
    platform: ManualPaymentPlatform;
    installmentPlanId: string | null;
    organiserPlanId: string | null;
    planSnapshot: ManualPaymentPlanSnapshot;
    amountMinor: bigint;
    currency: string;
    paymentMethodId: string;
    paymentMethodSnapshot: ManualPaymentMethodSnapshot;
    receiptUploadId: string;
  }): Promise<ManualPaymentSubmission> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      const open = await tx.manualPaymentSubmission.findFirst({
        where: { userId: input.userId, platform: input.platform, status: { in: [...OPEN_MANUAL_PAYMENT_STATUSES] } },
      });
      if (open) throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "You already have a payment awaiting review.");
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { accountType: true } });
      const application = input.platform === "ORGANISER" && user.accountType !== "POSTER"
        ? await tx.organiserApplication.findFirst({ where: { userId: input.userId, status: "PENDING_PAYMENT" } })
        : null;
      if (input.platform === "ORGANISER" && user.accountType !== "POSTER" && (!application || application.manualPaymentId)) {
        throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "Complete your organiser application before submitting payment.");
      }
      const created = await tx.manualPaymentSubmission.create({
      data: {
        reference: input.reference,
        userId: input.userId,
        platform: input.platform,
        installmentPlanId: input.installmentPlanId,
        organiserPlanId: input.organiserPlanId,
        planSnapshot: input.planSnapshot as unknown as Prisma.InputJsonValue,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paymentMethodId: input.paymentMethodId,
        paymentMethodSnapshot:
          input.paymentMethodSnapshot as unknown as Prisma.InputJsonValue,
        receiptUploadId: input.receiptUploadId,
      },
      });
      if (application) await tx.organiserApplication.update({ where: { id: application.id }, data: { manualPaymentId: created.id } });
      return created;
    });
    return toSubmissionDomain(row);
  }

  async findSubmissionById(
    id: string,
    transaction: Prisma.TransactionClient = this.prisma,
  ): Promise<ManualPaymentSubmissionWithUser | null> {
    const row = await transaction.manualPaymentSubmission.findUnique({
      where: { id },
    });
    if (!row) return null;
    const user = await transaction.user.findUnique({
      where: { id: row.userId },
      select: { id: true, email: true, displayName: true },
    });
    return {
      ...toSubmissionDomain(row),
      user: user ?? { id: row.userId, email: null, displayName: null },
    };
  }

  async listForUser(
    userId: string,
    filter: {
      platform?: ManualPaymentPlatform | undefined;
      status?: ManualPaymentStatus | undefined;
      page: number;
      limit: number;
    },
  ): Promise<{ items: ManualPaymentSubmission[]; total: number }> {
    const where: Prisma.ManualPaymentSubmissionWhereInput = {
      userId,
      ...(filter.platform ? { platform: filter.platform } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.manualPaymentSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.manualPaymentSubmission.count({ where }),
    ]);
    return { items: rows.map(toSubmissionDomain), total };
  }

  async listForAdmin(filter: {
    platform?: ManualPaymentPlatform | undefined;
    status?: ManualPaymentStatus | undefined;
    paymentMethodId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    q?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: ManualPaymentSubmissionWithUser[]; total: number }> {
    // No Prisma relation to User on this model (see the model's doc comment),
    // so a text search across the user's contact details is resolved to a
    // list of user ids first, then combined with the reference search below.
    let matchingUserIds: string[] | null = null;
    if (filter.q) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: filter.q, mode: "insensitive" } },
            { displayName: { contains: filter.q, mode: "insensitive" } },
            { phone: { contains: filter.q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 500,
      });
      matchingUserIds = users.map((user) => user.id);
    }

    const where: Prisma.ManualPaymentSubmissionWhereInput = {
      ...(filter.platform ? { platform: filter.platform } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.paymentMethodId
        ? { paymentMethodId: filter.paymentMethodId }
        : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
      ...(filter.q
        ? {
            OR: [
              { reference: { contains: filter.q, mode: "insensitive" } },
              { userId: { in: matchingUserIds ?? [] } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.manualPaymentSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.manualPaymentSubmission.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, email: true, displayName: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    return {
      items: rows.map((row) => ({
        ...toSubmissionDomain(row),
        user: userById.get(row.userId) ?? {
          id: row.userId,
          email: null,
          displayName: null,
        },
      })),
      total,
    };
  }

  /** Flips PENDING -> UNDER_REVIEW. No-op (returns the row unchanged) once it has left PENDING. */
  async markUnderReview(id: string): Promise<ManualPaymentSubmission | null> {
    const updated = await this.prisma.manualPaymentSubmission.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "UNDER_REVIEW" },
    });
    const row = await this.prisma.manualPaymentSubmission.findUnique({
      where: { id },
    });
    if (!row) return null;
    void updated;
    return toSubmissionDomain(row);
  }

  /**
   * Resolves a submission to APPROVED or REJECTED. The WHERE clause only
   * matches rows still open (PENDING/UNDER_REVIEW); if another request
   * already resolved it, `updateMany`'s count is 0 and this returns null —
   * the idempotency guard a repeated approve/reject click relies on.
   */
  async resolve(
    input: {
      id: string;
      status: "APPROVED" | "REJECTED";
      reviewerId: string;
      rejectionReason: string | null;
      now: Date;
    },
    transaction?: Prisma.TransactionClient,
  ): Promise<ManualPaymentSubmission | null> {
    const resolve = async (tx: Prisma.TransactionClient) => {
      const updated = await tx.manualPaymentSubmission.updateMany({
        where: {
          id: input.id,
          status: { in: [...OPEN_MANUAL_PAYMENT_STATUSES] },
        },
        data: {
          status: input.status,
          reviewedBy: input.reviewerId,
          reviewedAt: input.now,
          rejectionReason:
            input.status === "REJECTED" ? input.rejectionReason : null,
        },
      });
      if (updated.count === 0) return null;
      const row = await tx.manualPaymentSubmission.findUnique({
        where: { id: input.id },
      });
      if (row)
        await tx.auditLog.create({
          data: {
            actorId: input.reviewerId,
            actorRole: "admin",
            action: `${row.platform === "FINDLOVE" ? "findlove.admin" : "eventis"}.manual_payment.${input.status.toLowerCase()}`,
            subjectType: "ManualPayment",
            subjectId: row.id,
            changes: {
              target: row.reference,
              reason: input.rejectionReason ?? "Payment receipt approved",
              details: `${row.currency} ${row.amountMinor.toString()}`,
              platform: row.platform,
              userId: row.userId,
            },
          },
        });
      return row ? toSubmissionDomain(row) : null;
    };
    return transaction
      ? resolve(transaction)
      : this.prisma.$transaction(resolve);
  }

  transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(action, { timeout: 10000 });
  }
}
