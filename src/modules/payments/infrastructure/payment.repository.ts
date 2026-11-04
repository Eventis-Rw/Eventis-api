import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type InstallmentPlan as PrismaInstallmentPlan,
  type PaymentIntent as PrismaPaymentIntent,
  type ServiceSubscription as PrismaServiceSubscription,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  FINDLOVE_SERVICE,
  PENDING_PAYMENT_STATUSES,
  subscriptionExpiry,
  type ActiveSubscription,
  type AdminPaymentIntent,
  type FindLoveAccountType,
  type InstallmentInterval,
  type InstallmentPlan,
  type PaymentIntent,
  type PaymentIntentWithPlan,
  type PaymentMethod,
  type PaymentStatus,
  type ServiceSubscription,
} from "../domain/payment.js";

type PaymentWithPlan = Prisma.PaymentIntentGetPayload<{
  include: { installmentPlan: true };
}>;

type AdminPaymentRow = Prisma.PaymentIntentGetPayload<{
  include: {
    installmentPlan: true;
    user: {
      select: {
        id: true;
        phone: true;
        displayName: true;
        firstName: true;
        lastName: true;
      };
    };
  };
}>;

type SubscriptionWithDetails = Prisma.ServiceSubscriptionGetPayload<{
  include: { installmentPlan: true; paymentIntent: true };
}>;

export interface ProviderWebhookEventRecord {
  readonly id: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly paymentIntentId: string | null;
  readonly processedAt: Date | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listInstallmentPlans(input: {
    accountType?: FindLoveAccountType | undefined;
    isActive?: boolean | undefined;
  }): Promise<InstallmentPlan[]> {
    const rows = await this.prisma.installmentPlan.findMany({
      where: {
        ...(input.accountType ? { accountType: input.accountType } : {}),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      orderBy: [{ accountType: "asc" }, { durationDays: "asc" }],
    });
    return rows.map(toInstallmentPlanDomain);
  }

  async findInstallmentPlanById(id: string): Promise<InstallmentPlan | null> {
    const row = await this.prisma.installmentPlan.findUnique({ where: { id } });
    return row ? toInstallmentPlanDomain(row) : null;
  }

  async createInstallmentPlan(input: {
    accountType: FindLoveAccountType;
    interval: InstallmentInterval;
    durationDays: number;
    priceMinor: bigint;
    isActive: boolean;
  }): Promise<InstallmentPlan> {
    const row = await this.prisma.installmentPlan.create({
      data: {
        accountType: input.accountType,
        interval: input.interval,
        durationDays: input.durationDays,
        priceMinor: input.priceMinor,
        isActive: input.isActive,
      },
    });
    return toInstallmentPlanDomain(row);
  }

  async updateInstallmentPlan(
    id: string,
    input: {
      interval?: InstallmentInterval | undefined;
      durationDays?: number | undefined;
      priceMinor?: bigint | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<InstallmentPlan> {
    const data: Prisma.InstallmentPlanUpdateInput = {};
    if (input.interval !== undefined) data.interval = input.interval;
    if (input.durationDays !== undefined)
      data.durationDays = input.durationDays;
    if (input.priceMinor !== undefined) data.priceMinor = input.priceMinor;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const row = await this.prisma.installmentPlan.update({
      where: { id },
      data,
    });
    return toInstallmentPlanDomain(row);
  }

  async nextPaymentReference(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ value: string }>>`
      SELECT nextval('payment_reference_seq')::text AS value
    `;
    const value = rows[0]?.value;
    if (!value) throw new Error("Payment reference sequence is unavailable");
    return `PAY-${value}`;
  }

  async createPaymentIntent(input: {
    reference: string;
    userId: string;
    installmentPlanId: string;
    accountType: FindLoveAccountType;
    amountMinor: bigint;
    currency: string;
    paymentMethod: PaymentMethod;
    phoneNumber: string;
    provider: string;
    idempotencyKey: string | null;
    expiresAt: Date;
  }): Promise<PaymentIntentWithPlan> {
    const row = await this.prisma.paymentIntent.create({
      data: {
        reference: input.reference,
        userId: input.userId,
        installmentPlanId: input.installmentPlanId,
        accountType: input.accountType,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        phoneNumber: input.phoneNumber,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
      },
      include: { installmentPlan: true },
    });
    return toPaymentWithPlanDomain(row);
  }

  async findPaymentById(id: string): Promise<PaymentIntentWithPlan | null> {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: { installmentPlan: true },
    });
    return row ? toPaymentWithPlanDomain(row) : null;
  }

  async findPaymentByIdentifier(
    identifier: string,
  ): Promise<PaymentIntentWithPlan | null> {
    if (UUID_REGEX.test(identifier)) return this.findPaymentById(identifier);
    const row = await this.prisma.paymentIntent.findUnique({
      where: { reference: identifier },
      include: { installmentPlan: true },
    });
    return row ? toPaymentWithPlanDomain(row) : null;
  }

  async findPaymentByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentIntentWithPlan | null> {
    const row = await this.prisma.paymentIntent.findFirst({
      where: { userId, idempotencyKey },
      include: { installmentPlan: true },
    });
    return row ? toPaymentWithPlanDomain(row) : null;
  }

  async findReusablePendingPayment(input: {
    userId: string;
    installmentPlanId: string;
    paymentMethod: PaymentMethod;
    since: Date;
    now: Date;
  }): Promise<PaymentIntentWithPlan | null> {
    const row = await this.prisma.paymentIntent.findFirst({
      where: {
        userId: input.userId,
        installmentPlanId: input.installmentPlanId,
        paymentMethod: input.paymentMethod,
        status: { in: [...PENDING_PAYMENT_STATUSES] },
        createdAt: { gte: input.since },
        expiresAt: { gt: input.now },
      },
      orderBy: { createdAt: "desc" },
      include: { installmentPlan: true },
    });
    return row ? toPaymentWithPlanDomain(row) : null;
  }

  async updatePaymentIntent(
    id: string,
    input: {
      status?: PaymentStatus | undefined;
      providerTransactionId?: string | null | undefined;
      failureReason?: string | null | undefined;
      providerRequestedAt?: Date | null | undefined;
      paidAt?: Date | null | undefined;
    },
  ): Promise<PaymentIntentWithPlan> {
    const data: Prisma.PaymentIntentUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.providerTransactionId !== undefined) {
      data.providerTransactionId = input.providerTransactionId;
    }
    if (input.failureReason !== undefined)
      data.failureReason = input.failureReason;
    if (input.providerRequestedAt !== undefined) {
      data.providerRequestedAt = input.providerRequestedAt;
    }
    if (input.paidAt !== undefined) data.paidAt = input.paidAt;

    const row = await this.prisma.paymentIntent.update({
      where: { id },
      data,
      include: { installmentPlan: true },
    });
    return toPaymentWithPlanDomain(row);
  }

  async recordWebhookEvent(input: {
    provider: string;
    providerEventId: string;
    paymentIntentId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ event: ProviderWebhookEventRecord; duplicate: boolean }> {
    try {
      const row = await this.prisma.providerWebhookEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          paymentIntentId: input.paymentIntentId,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
          signatureValid: true,
        },
      });
      return { event: toWebhookEventDomain(row), duplicate: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const row = await this.prisma.providerWebhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: input.provider,
            providerEventId: input.providerEventId,
          },
        },
      });
      if (!row) throw error;
      return { event: toWebhookEventDomain(row), duplicate: true };
    }
  }

  async markWebhookEventProcessed(
    id: string,
    input: {
      paymentIntentId?: string | undefined;
      processedAt: Date | null;
      error?: string | undefined;
    },
  ): Promise<void> {
    await this.prisma.providerWebhookEvent.update({
      where: { id },
      data: {
        ...(input.paymentIntentId
          ? { paymentIntentId: input.paymentIntentId }
          : {}),
        processedAt: input.processedAt,
        processingError: input.error ?? null,
      },
    });
  }

  async activateSubscription(input: {
    userId: string;
    payment: PaymentIntent;
    plan: InstallmentPlan;
    now: Date;
  }): Promise<ServiceSubscription> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceSubscription.findUnique({
          where: { paymentIntentId: input.payment.id },
        });
        if (existing) {
          await tx.paymentIntent.update({
            where: { id: input.payment.id },
            data: {
              status: "SUCCEEDED",
              paidAt: input.payment.paidAt ?? input.now,
              failureReason: null,
            },
          });
          return toSubscriptionDomain(existing);
        }

        const current = await tx.serviceSubscription.findFirst({
          where: {
            userId: input.userId,
            service: FINDLOVE_SERVICE,
            expiresAt: { gt: input.now },
          },
          orderBy: { expiresAt: "desc" },
        });
        const expiresAt = subscriptionExpiry(
          input.now,
          input.plan.durationDays,
          current?.expiresAt ?? null,
        );
        const created = await tx.serviceSubscription.create({
          data: {
            userId: input.userId,
            service: FINDLOVE_SERVICE,
            accountType: input.plan.accountType,
            installmentPlanId: input.plan.id,
            paymentIntentId: input.payment.id,
            expiresAt,
          },
        });
        await tx.paymentIntent.update({
          where: { id: input.payment.id },
          data: {
            status: "SUCCEEDED",
            paidAt: input.payment.paidAt ?? input.now,
            failureReason: null,
          },
        });
        return toSubscriptionDomain(created);
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.serviceSubscription.findUnique({
        where: { paymentIntentId: input.payment.id },
      });
      if (!existing) throw error;
      return toSubscriptionDomain(existing);
    }
  }

  async findActiveSubscription(
    userId: string,
    now: Date,
  ): Promise<ActiveSubscription | null> {
    const row = await this.prisma.serviceSubscription.findFirst({
      where: {
        userId,
        service: FINDLOVE_SERVICE,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
      include: { installmentPlan: true, paymentIntent: true },
    });
    return row ? toActiveSubscriptionDomain(row) : null;
  }

  async listPayments(input: {
    page: number;
    limit: number;
    statuses?: PaymentStatus[] | undefined;
    accountType?: FindLoveAccountType | undefined;
    paymentMethod?: PaymentMethod | undefined;
  }): Promise<{ items: AdminPaymentIntent[]; total: number }> {
    const where: Prisma.PaymentIntentWhereInput = {
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
      ...(input.accountType ? { accountType: input.accountType } : {}),
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    };
    const skip = (input.page - 1) * input.limit;
    const [rows, total] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: input.limit,
        include: {
          installmentPlan: true,
          user: {
            select: {
              id: true,
              phone: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.paymentIntent.count({ where }),
    ]);
    return { items: rows.map(toAdminPaymentDomain), total };
  }
}

function toInstallmentPlanDomain(row: PrismaInstallmentPlan): InstallmentPlan {
  return {
    id: row.id,
    accountType: row.accountType,
    interval: row.interval,
    durationDays: row.durationDays,
    priceMinor: row.priceMinor,
    currency: row.currency,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPaymentDomain(row: PrismaPaymentIntent): PaymentIntent {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.userId,
    installmentPlanId: row.installmentPlanId,
    accountType: row.accountType,
    amountMinor: row.amountMinor,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    phoneNumber: row.phoneNumber,
    status: row.status,
    provider: row.provider,
    providerTransactionId: row.providerTransactionId,
    failureReason: row.failureReason,
    idempotencyKey: row.idempotencyKey,
    expiresAt: row.expiresAt,
    providerRequestedAt: row.providerRequestedAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPaymentWithPlanDomain(row: PaymentWithPlan): PaymentIntentWithPlan {
  if (!row.installmentPlan) {
    throw new Error("Payment intent is missing an installment plan");
  }
  return {
    ...toPaymentDomain(row),
    plan: toInstallmentPlanDomain(row.installmentPlan),
  };
}

function toAdminPaymentDomain(row: AdminPaymentRow): AdminPaymentIntent {
  return {
    ...toPaymentDomain(row),
    plan: row.installmentPlan
      ? toInstallmentPlanDomain(row.installmentPlan)
      : null,
    user: {
      id: row.user.id,
      phone: row.user.phone,
      displayName: row.user.displayName,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
    },
  };
}

function toSubscriptionDomain(
  row: PrismaServiceSubscription,
): ServiceSubscription {
  return {
    id: row.id,
    userId: row.userId,
    service: row.service,
    accountType: row.accountType,
    installmentPlanId: row.installmentPlanId,
    paymentIntentId: row.paymentIntentId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function toActiveSubscriptionDomain(
  row: SubscriptionWithDetails,
): ActiveSubscription {
  return {
    ...toSubscriptionDomain(row),
    plan: row.installmentPlan
      ? toInstallmentPlanDomain(row.installmentPlan)
      : null,
    payment: row.paymentIntent ? toPaymentDomain(row.paymentIntent) : null,
  };
}

function toWebhookEventDomain(row: {
  id: string;
  provider: string;
  providerEventId: string;
  paymentIntentId: string | null;
  processedAt: Date | null;
}): ProviderWebhookEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    paymentIntentId: row.paymentIntentId,
    processedAt: row.processedAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
