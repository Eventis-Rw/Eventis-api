import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import {
  agreementStatusForSchedules,
  countsTowardsOutstanding,
  isScheduleOverdue,
  type AgreementStatus,
  type EventInstallmentAgreement,
  type EventInstallmentSchedule,
  type ScheduleStatus,
} from "../domain/installment-agreement.js";
import { outstandingFor } from "../domain/installment-calculation.js";
import type {
  EventInstallmentAuditLog,
  EventInstallmentLateFee,
  EventInstallmentNotification,
  EventInstallmentPayment,
  EventInstallmentRefund,
  InstallmentCustomerSummary as CustomerSummary,
  InstallmentNotificationChannel,
  InstallmentNotificationType,
  InstallmentPaymentSource,
  InstallmentPaymentStatus,
  RefundStatus,
} from "../domain/installment-payment.js";
import {
  computeLateFeeAmount,
  type EventInstallmentPlan,
} from "../domain/installment-plan.js";

type Tx = Prisma.TransactionClient;
type PrismaAgreement = Prisma.EventInstallmentAgreementGetPayload<{
  include: { schedules: true; plan: true; event: true };
}>;
type PrismaSchedule = Prisma.EventInstallmentScheduleGetPayload<Record<string, never>>;
type PrismaPlan = Prisma.EventInstallmentPlanGetPayload<Record<string, never>>;
type PrismaPayment = Prisma.EventInstallmentPaymentGetPayload<{
  include: {
    agreement: { include: { event: true } };
    schedule: true;
    refunds: true;
  };
}>;
type PrismaRefund = Prisma.EventInstallmentRefundGetPayload<{
  include: { payment: { include: { agreement: { include: { event: true } } } } };
}>;
type PrismaLateFee = Prisma.EventInstallmentLateFeeGetPayload<Record<string, never>>;
type PrismaNotification = Prisma.EventInstallmentNotificationGetPayload<Record<string, never>>;
type PrismaAuditLog = Prisma.EventInstallmentAuditLogGetPayload<{
  include: {
    actor: {
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

export interface EventSummary {
  readonly eventId: string;
  readonly title: string;
  readonly posterId: string;
  readonly organisationId: string | null;
  readonly status: string;
}

export type { CustomerSummary };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class EventInstallmentRepository {
  constructor(private readonly prisma: PrismaService) {}


  async listPlans(input: {
    isActive?: boolean | undefined;
  }): Promise<EventInstallmentPlan[]> {
    const rows = await this.prisma.eventInstallmentPlan.findMany({
      where: {
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toPlanDomain);
  }

  async findPlanById(id: string): Promise<EventInstallmentPlan | null> {
    const row = await this.prisma.eventInstallmentPlan.findUnique({
      where: { id },
    });
    return row ? toPlanDomain(row) : null;
  }

  async createPlan(input: {
    name: string;
    description: string | null;
    frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
    intervalCount: number;
    installmentCount: number;
    initialPaymentType: "FIXED" | "PERCENT";
    initialPaymentValue: bigint;
    interestRateBps: number;
    lateFeeType: "FIXED" | "PERCENT";
    lateFeeValue: bigint;
    gracePeriodDays: number;
    allowPartialPayment: boolean;
    allowEarlyPayment: boolean;
    currency: string;
    isActive: boolean;
  }): Promise<EventInstallmentPlan> {
    const row = await this.prisma.eventInstallmentPlan.create({
      data: { ...input },
    });
    return toPlanDomain(row);
  }

  async updatePlan(
    id: string,
    input: Partial<{
      name: string;
      description: string | null;
      frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
      intervalCount: number;
      installmentCount: number;
      initialPaymentType: "FIXED" | "PERCENT";
      initialPaymentValue: bigint;
      interestRateBps: number;
      lateFeeType: "FIXED" | "PERCENT";
      lateFeeValue: bigint;
      gracePeriodDays: number;
      allowPartialPayment: boolean;
      allowEarlyPayment: boolean;
      isActive: boolean;
    }>,
  ): Promise<EventInstallmentPlan> {
    const row = await this.prisma.eventInstallmentPlan.update({
      where: { id },
      data: input,
    });
    return toPlanDomain(row);
  }


  async findEventById(eventId: string): Promise<EventSummary | null> {
    const row = await this.prisma.event.findUnique({
      where: { eventId },
      select: {
        eventId: true,
        title: true,
        posterId: true,
        organisationId: true,
        status: true,
      },
    });
    return row ?? null;
  }

  async findCustomerById(id: string): Promise<CustomerSummary | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        displayName: true,
        firstName: true,
        lastName: true,
      },
    });
    return row ?? null;
  }


  async createAgreement(input: {
    customerId: string;
    eventId: string;
    planId: string | null;
    totalAmountMinor: bigint;
    initialPaymentMinor: bigint;
    interestAmountMinor: bigint;
    totalPayableMinor: bigint;
    outstandingBalanceMinor: bigint;
    currency: string;
    frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
    intervalCount: number;
    installmentCount: number;
    gracePeriodDays: number;
    lateFeeType: "FIXED" | "PERCENT";
    lateFeeValue: bigint;
    allowPartialPayment: boolean;
    allowEarlyPayment: boolean;
    startDate: Date;
    status: AgreementStatus;
    schedules: Array<{
      installmentNumber: number;
      isInitialPayment: boolean;
      dueDate: Date;
      principalAmountMinor: bigint;
      interestAmountMinor: bigint;
      amountDueMinor: bigint;
      outstandingAmountMinor: bigint;
    }>;
  }): Promise<EventInstallmentAgreement> {
    const row = await this.prisma.eventInstallmentAgreement.create({
      data: {
        customerId: input.customerId,
        eventId: input.eventId,
        planId: input.planId,
        totalAmountMinor: input.totalAmountMinor,
        initialPaymentMinor: input.initialPaymentMinor,
        interestAmountMinor: input.interestAmountMinor,
        totalPayableMinor: input.totalPayableMinor,
        outstandingBalanceMinor: input.outstandingBalanceMinor,
        currency: input.currency,
        frequency: input.frequency,
        intervalCount: input.intervalCount,
        installmentCount: input.installmentCount,
        gracePeriodDays: input.gracePeriodDays,
        lateFeeType: input.lateFeeType,
        lateFeeValue: input.lateFeeValue,
        allowPartialPayment: input.allowPartialPayment,
        allowEarlyPayment: input.allowEarlyPayment,
        startDate: input.startDate,
        status: input.status,
        schedules: {
          create: input.schedules.map((schedule) => ({
            installmentNumber: schedule.installmentNumber,
            isInitialPayment: schedule.isInitialPayment,
            dueDate: schedule.dueDate,
            principalAmountMinor: schedule.principalAmountMinor,
            interestAmountMinor: schedule.interestAmountMinor,
            amountDueMinor: schedule.amountDueMinor,
            outstandingAmountMinor: schedule.outstandingAmountMinor,
          })),
        },
      },
      include: { schedules: true, plan: true, event: true },
    });
    return toAgreementDomain(row);
  }

  async findAgreementById(
    id: string,
  ): Promise<EventInstallmentAgreement | null> {
    const row = await this.prisma.eventInstallmentAgreement.findUnique({
      where: { id },
      include: {
        schedules: { orderBy: { installmentNumber: "asc" } },
        plan: true,
        event: true,
      },
    });
    return row ? toAgreementDomain(row) : null;
  }

  async listAgreements(input: {
    page: number;
    limit: number;
    customerId?: string | undefined;
    eventId?: string | undefined;
    statuses?: AgreementStatus[] | undefined;
    createdFrom?: Date | undefined;
    createdTo?: Date | undefined;
  }): Promise<{ items: EventInstallmentAgreement[]; total: number }> {
    const where: Prisma.EventInstallmentAgreementWhereInput = {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentAgreement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          schedules: { orderBy: { installmentNumber: "asc" } },
          plan: true,
          event: true,
        },
      }),
      this.prisma.eventInstallmentAgreement.count({ where }),
    ]);
    return { items: rows.map(toAgreementDomain), total };
  }

  /**
   * Regenerates unpaid schedules for an agreement revision. Only allowed when
   * no money has been collected; paid history is never rewritten.
   */
  async reviseAgreementSchedules(
    agreementId: string,
    terms: {
      frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
      intervalCount: number;
      installmentCount: number;
      startDate: Date;
      allowPartialPayment: boolean;
      allowEarlyPayment: boolean;
    },
    balances: {
      totalAmountMinor: bigint;
      initialPaymentMinor: bigint;
      interestAmountMinor: bigint;
      totalPayableMinor: bigint;
      outstandingBalanceMinor: bigint;
    },
    schedules: Array<{
      installmentNumber: number;
      isInitialPayment: boolean;
      dueDate: Date;
      principalAmountMinor: bigint;
      interestAmountMinor: bigint;
      amountDueMinor: bigint;
      outstandingAmountMinor: bigint;
    }>,
  ): Promise<EventInstallmentAgreement> {
    return this.prisma.$transaction(async (tx) => {
      await tx.eventInstallmentSchedule.deleteMany({
        where: { agreementId },
      });
      const row = await tx.eventInstallmentAgreement.update({
        where: { id: agreementId },
        data: {
          frequency: terms.frequency,
          intervalCount: terms.intervalCount,
          installmentCount: terms.installmentCount,
          startDate: terms.startDate,
          allowPartialPayment: terms.allowPartialPayment,
          allowEarlyPayment: terms.allowEarlyPayment,
          ...balances,
          schedules: {
            create: schedules.map((schedule) => ({
              installmentNumber: schedule.installmentNumber,
              isInitialPayment: schedule.isInitialPayment,
              dueDate: schedule.dueDate,
              principalAmountMinor: schedule.principalAmountMinor,
              interestAmountMinor: schedule.interestAmountMinor,
              amountDueMinor: schedule.amountDueMinor,
              outstandingAmountMinor: schedule.outstandingAmountMinor,
            })),
          },
        },
        include: {
          schedules: { orderBy: { installmentNumber: "asc" } },
          plan: true,
          event: true,
        },
      });
      return toAgreementDomain(row);
    });
  }

  /** Compare-and-swap status change; returns null when the CAS loses. */
  async transitionAgreementStatus(
    agreementId: string,
    from: AgreementStatus[],
    to: AgreementStatus,
  ): Promise<EventInstallmentAgreement | null> {
    const updated = await this.prisma.eventInstallmentAgreement.updateMany({
      where: { id: agreementId, status: { in: from } },
      data: { status: to },
    });
    if (updated.count === 0) return null;
    return this.findAgreementById(agreementId);
  }

  async reopenCompletedAgreement(agreementId: string): Promise<void> {
    await this.prisma.eventInstallmentAgreement.updateMany({
      where: { id: agreementId, status: "COMPLETED" },
      data: { status: "ACTIVE" },
    });
  }


  async listSchedules(input: {
    page: number;
    limit: number;
    agreementId?: string | undefined;
    customerId?: string | undefined;
    eventId?: string | undefined;
    statuses?: ScheduleStatus[] | undefined;
    dueFrom?: Date | undefined;
    dueTo?: Date | undefined;
  }): Promise<{
    items: Array<{
      schedule: EventInstallmentSchedule;
      agreement: EventInstallmentAgreement;
    }>;
    total: number;
  }> {
    const where: Prisma.EventInstallmentScheduleWhereInput = {
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
      ...(input.dueFrom || input.dueTo
        ? {
            dueDate: {
              ...(input.dueFrom ? { gte: input.dueFrom } : {}),
              ...(input.dueTo ? { lte: input.dueTo } : {}),
            },
          }
        : {}),
      agreement: {
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentSchedule.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          agreement: { include: { schedules: true, plan: true, event: true } },
        },
      }),
      this.prisma.eventInstallmentSchedule.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        schedule: toScheduleDomain(row),
        agreement: toAgreementDomain(row.agreement),
      })),
      total,
    };
  }

  async findScheduleById(id: string): Promise<EventInstallmentSchedule | null> {
    const row = await this.prisma.eventInstallmentSchedule.findUnique({
      where: { id },
    });
    return row ? toScheduleDomain(row) : null;
  }

  async findSchedulesForAgreement(
    agreementId: string,
  ): Promise<EventInstallmentSchedule[]> {
    const rows = await this.prisma.eventInstallmentSchedule.findMany({
      where: { agreementId },
      orderBy: { installmentNumber: "asc" },
    });
    return rows.map(toScheduleDomain);
  }

  async findScheduleWithAgreement(
    id: string,
  ): Promise<{ schedule: EventInstallmentSchedule; agreement: EventInstallmentAgreement } | null> {
    const row = await this.prisma.eventInstallmentSchedule.findUnique({
      where: { id },
      include: {
        agreement: { include: { schedules: true, plan: true, event: true } },
      },
    });
    if (!row) return null;
    return {
      schedule: toScheduleDomain(row),
      agreement: toAgreementDomain(row.agreement),
    };
  }

  async adjustScheduleDueDate(
    scheduleId: string,
    dueDate: Date,
  ): Promise<EventInstallmentSchedule | null> {
    const row = await this.prisma.eventInstallmentSchedule.update({
      where: { id: scheduleId },
      data: { dueDate },
    });
    return toScheduleDomain(row);
  }

  async setScheduleStatus(
    scheduleId: string,
    status: ScheduleStatus,
  ): Promise<void> {
    await this.prisma.eventInstallmentSchedule.update({
      where: { id: scheduleId },
      data: { status },
    });
  }


  async createInstallmentPayment(input: {
    agreementId: string;
    scheduleId: string;
    customerId: string;
    source: InstallmentPaymentSource;
    amountMinor: bigint;
    currency: string;
    paymentMethod: "MTN_MOMO" | "AIRTEL_MONEY" | null;
    transactionReference: string | null;
  }): Promise<EventInstallmentPayment> {
    const row = await this.prisma.eventInstallmentPayment.create({
      data: {
        agreementId: input.agreementId,
        scheduleId: input.scheduleId,
        customerId: input.customerId,
        source: input.source,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference,
      },
      include: {
        agreement: { include: { event: true } },
        schedule: true,
        refunds: true,
      },
    });
    return toPaymentDomain(row);
  }

  async findInstallmentPaymentById(
    id: string,
  ): Promise<EventInstallmentPayment | null> {
    const row = await this.prisma.eventInstallmentPayment.findUnique({
      where: { id },
      include: {
        agreement: { include: { event: true } },
        schedule: true,
        refunds: true,
      },
    });
    return row ? toPaymentDomain(row) : null;
  }

  async findInstallmentPaymentByIntent(
    paymentIntentId: string,
  ): Promise<EventInstallmentPayment | null> {
    const row = await this.prisma.eventInstallmentPayment.findUnique({
      where: { paymentIntentId },
      include: {
        agreement: { include: { event: true } },
        schedule: true,
        refunds: true,
      },
    });
    return row ? toPaymentDomain(row) : null;
  }

  async findPendingInstallmentPayment(input: {
    scheduleId: string;
    paymentMethod: "MTN_MOMO" | "AIRTEL_MONEY";
    since: Date;
  }): Promise<EventInstallmentPayment | null> {
    const row = await this.prisma.eventInstallmentPayment.findFirst({
      where: {
        scheduleId: input.scheduleId,
        source: "PROVIDER",
        paymentMethod: input.paymentMethod,
        status: "PENDING",
        createdAt: { gte: input.since },
      },
      orderBy: { createdAt: "desc" },
      include: {
        agreement: { include: { event: true } },
        schedule: true,
        refunds: true,
      },
    });
    return row ? toPaymentDomain(row) : null;
  }

  async linkPaymentIntent(
    installmentPaymentId: string,
    paymentIntentId: string,
  ): Promise<void> {
    await this.prisma.eventInstallmentPayment.update({
      where: { id: installmentPaymentId },
      data: { paymentIntentId },
    });
  }

  async setInstallmentPaymentStatus(
    installmentPaymentId: string,
    status: InstallmentPaymentStatus,
    transactionReference?: string | null,
  ): Promise<void> {
    await this.prisma.eventInstallmentPayment.update({
      where: { id: installmentPaymentId },
      data: {
        status,
        ...(transactionReference !== undefined
          ? { transactionReference }
          : {}),
      },
    });
  }

  /**
   * The one place a confirmed collection is applied. Idempotent by
   * compare-and-swap on the installment payment status: concurrent webhook
   * and status-poll confirmations cannot double-credit a schedule.
   */
  async applyConfirmedCollection(input: {
    installmentPaymentId: string;
    paidAt: Date;
    transactionReference: string | null;
    now: Date;
  }): Promise<{ applied: boolean; payment: EventInstallmentPayment | null }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventInstallmentPayment.updateMany({
        where: {
          id: input.installmentPaymentId,
          status: { in: ["PENDING", "FAILED", "CANCELLED"] },
        },
        data: {
          status: "SUCCEEDED",
          paidAt: input.paidAt,
          transactionReference: input.transactionReference,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.eventInstallmentPayment.findUnique({
          where: { id: input.installmentPaymentId },
          include: {
            agreement: { include: { event: true } },
            schedule: true,
            refunds: true,
          },
        });
        return {
          applied: false,
          payment: current ? toPaymentDomain(current) : null,
        };
      }

      const payment = await tx.eventInstallmentPayment.findUniqueOrThrow({
        where: { id: input.installmentPaymentId },
      });
      const schedule = await tx.eventInstallmentSchedule.update({
        where: { id: payment.scheduleId },
        data: {
          amountPaidMinor: { increment: payment.amountMinor },
        },
      });
      await tx.eventInstallmentSchedule.update({
        where: { id: payment.scheduleId },
        data: {
          outstandingAmountMinor: outstandingFor(
            schedule.amountDueMinor,
            schedule.amountPaidMinor,
            schedule.refundedAmountMinor,
          ),
        },
      });

      const agreement = await this.reconcileAgreementTx(
        tx,
        payment.agreementId,
        input.now,
      );

      await tx.eventInstallmentAuditLog.create({
        data: {
          action: "payment.confirmed",
          entityType: "EventInstallmentPayment",
          entityId: payment.id,
          actorId: null,
          newValues: {
            status: "SUCCEEDED",
            amount_minor: payment.amountMinor.toString(10),
            transaction_reference: input.transactionReference,
            source: payment.source,
          },
        },
      });
      await tx.eventInstallmentNotification.create({
        data: {
          customerId: payment.customerId,
          agreementId: payment.agreementId,
          scheduleId: payment.scheduleId,
          notificationType: "PAYMENT_CONFIRMED",
          channels: ["SMS"],
          status: "PENDING",
        },
      });
      if (agreement.status === "COMPLETED") {
        await tx.eventInstallmentNotification.create({
          data: {
            customerId: agreement.customerId,
            agreementId: agreement.id,
            notificationType: "AGREEMENT_COMPLETED",
            channels: ["SMS"],
            status: "PENDING",
          },
        });
      }

      const full = await tx.eventInstallmentPayment.findUnique({
        where: { id: payment.id },
        include: {
          agreement: { include: { event: true } },
          schedule: true,
          refunds: true,
        },
      });
      return { applied: true, payment: full ? toPaymentDomain(full) : null };
    });
  }

  async listInstallmentPayments(input: {
    page: number;
    limit: number;
    customerId?: string | undefined;
    eventId?: string | undefined;
    agreementId?: string | undefined;
    scheduleId?: string | undefined;
    statuses?: InstallmentPaymentStatus[] | undefined;
    createdFrom?: Date | undefined;
    createdTo?: Date | undefined;
  }): Promise<{ items: EventInstallmentPayment[]; total: number }> {
    const where: Prisma.EventInstallmentPaymentWhereInput = {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
      agreement: {
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.agreementId ? { id: input.agreementId } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          agreement: { include: { event: true } },
          schedule: true,
          refunds: true,
        },
      }),
      this.prisma.eventInstallmentPayment.count({ where }),
    ]);
    return { items: rows.map(toPaymentDomain), total };
  }


  async createRefund(input: {
    installmentPaymentId: string;
    amountMinor: bigint;
    reason: string;
  }): Promise<EventInstallmentRefund> {
    const row = await this.prisma.eventInstallmentRefund.create({
      data: {
        installmentPaymentId: input.installmentPaymentId,
        amountMinor: input.amountMinor,
        reason: input.reason,
      },
      include: {
        payment: { include: { agreement: { include: { event: true } } } },
      },
    });
    return toRefundDomain(row);
  }

  async findRefundById(id: string): Promise<EventInstallmentRefund | null> {
    const row = await this.prisma.eventInstallmentRefund.findUnique({
      where: { id },
      include: {
        payment: { include: { agreement: { include: { event: true } } } },
      },
    });
    return row ? toRefundDomain(row) : null;
  }

  async listRefunds(input: {
    page: number;
    limit: number;
    statuses?: RefundStatus[] | undefined;
  }): Promise<{ items: EventInstallmentRefund[]; total: number }> {
    const where: Prisma.EventInstallmentRefundWhereInput = {
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentRefund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          payment: { include: { agreement: { include: { event: true } } } },
        },
      }),
      this.prisma.eventInstallmentRefund.count({ where }),
    ]);
    return { items: rows.map(toRefundDomain), total };
  }

  /**
   * Confirms a refund as a separate financial transaction. Collected history
   * is preserved; net collected amounts and outstanding balances are
   * recomputed. Compare-and-swap prevents double-processing.
   */
  async completeRefund(input: {
    refundId: string;
    processedBy: string;
    providerRefundReference: string | null;
    now: Date;
  }): Promise<{
    completed: boolean;
    refund: EventInstallmentRefund | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventInstallmentRefund.updateMany({
        where: { id: input.refundId, status: "REQUESTED" },
        data: {
          status: "COMPLETED",
          processedBy: input.processedBy,
          processedAt: input.now,
          providerRefundReference: input.providerRefundReference,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.eventInstallmentRefund.findUnique({
          where: { id: input.refundId },
          include: {
            payment: { include: { agreement: { include: { event: true } } } },
          },
        });
        return {
          completed: false,
          refund: current ? toRefundDomain(current) : null,
        };
      }

      const refund = await tx.eventInstallmentRefund.findUniqueOrThrow({
        where: { id: input.refundId },
      });
      const payment = await tx.eventInstallmentPayment.update({
        where: { id: refund.installmentPaymentId },
        data: { refundedAmountMinor: { increment: refund.amountMinor } },
      });
      const newPaymentStatus =
        payment.refundedAmountMinor >= payment.amountMinor
          ? "REFUNDED"
          : "PARTIALLY_REFUNDED";
      await tx.eventInstallmentPayment.update({
        where: { id: payment.id },
        data: { status: newPaymentStatus },
      });

      const schedule = await tx.eventInstallmentSchedule.update({
        where: { id: payment.scheduleId },
        data: { refundedAmountMinor: { increment: refund.amountMinor } },
      });
      await tx.eventInstallmentSchedule.update({
        where: { id: payment.scheduleId },
        data: {
          outstandingAmountMinor: outstandingFor(
            schedule.amountDueMinor,
            schedule.amountPaidMinor,
            schedule.refundedAmountMinor,
          ),
        },
      });

      await this.reopenCompletedAgreementInTx(tx, payment.agreementId);
      await this.reconcileAgreementTx(tx, payment.agreementId, input.now);

      await tx.eventInstallmentAuditLog.create({
        data: {
          actorId: input.processedBy,
          action: "refund.completed",
          entityType: "EventInstallmentRefund",
          entityId: refund.id,
          newValues: {
            amount_minor: refund.amountMinor.toString(10),
            provider_refund_reference: input.providerRefundReference,
            payment_id: payment.id,
          },
          reason: refund.reason,
        },
      });
      await tx.eventInstallmentNotification.create({
        data: {
          customerId: payment.customerId,
          agreementId: payment.agreementId,
          scheduleId: payment.scheduleId,
          notificationType: "REFUND_COMPLETED",
          channels: ["SMS"],
          status: "PENDING",
        },
      });

      const full = await tx.eventInstallmentRefund.findUnique({
        where: { id: refund.id },
        include: {
          payment: { include: { agreement: { include: { event: true } } } },
        },
      });
      return { completed: true, refund: full ? toRefundDomain(full) : null };
    });
  }

  async rejectRefund(input: {
    refundId: string;
    processedBy: string;
    rejectionReason: string;
    now: Date;
  }): Promise<{ rejected: boolean; refund: EventInstallmentRefund | null }> {
    const claimed = await this.prisma.eventInstallmentRefund.updateMany({
      where: { id: input.refundId, status: "REQUESTED" },
      data: {
        status: "REJECTED",
        processedBy: input.processedBy,
        processedAt: input.now,
        rejectionReason: input.rejectionReason,
      },
    });
    if (claimed.count === 0) return { rejected: false, refund: null };
    const refund = await this.findRefundById(input.refundId);
    return { rejected: true, refund };
  }


  async applyLateFee(input: {
    agreementId: string;
    scheduleId: string;
    feeType: "FIXED" | "PERCENT";
    amountMinor: bigint;
    reason: string;
    now: Date;
  }): Promise<{ applied: boolean; lateFee: EventInstallmentLateFee | null }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.eventInstallmentLateFee.findFirst({
        where: {
          scheduleId: input.scheduleId,
          feeType: input.feeType,
          status: "APPLIED",
        },
      });
      if (existing) {
        return {
          applied: false,
          lateFee: toLateFeeDomain(existing),
        };
      }

      const lateFee = await tx.eventInstallmentLateFee.create({
        data: {
          agreementId: input.agreementId,
          scheduleId: input.scheduleId,
          feeType: input.feeType,
          amountMinor: input.amountMinor,
          reason: input.reason,
          appliedAt: input.now,
        },
      });

      const schedule = await tx.eventInstallmentSchedule.update({
        where: { id: input.scheduleId },
        data: {
          lateFeeAmountMinor: { increment: input.amountMinor },
          amountDueMinor: { increment: input.amountMinor },
        },
      });
      await tx.eventInstallmentSchedule.update({
        where: { id: input.scheduleId },
        data: {
          outstandingAmountMinor: outstandingFor(
            schedule.amountDueMinor,
            schedule.amountPaidMinor,
            schedule.refundedAmountMinor,
          ),
        },
      });

      await this.reconcileAgreementTx(tx, input.agreementId, input.now);

      await tx.eventInstallmentAuditLog.create({
        data: {
          actorId: null,
          action: "late_fee.applied",
          entityType: "EventInstallmentLateFee",
          entityId: lateFee.id,
          newValues: {
            amount_minor: input.amountMinor.toString(10),
            fee_type: input.feeType,
            schedule_id: input.scheduleId,
          },
          reason: input.reason,
        },
      });
      await tx.eventInstallmentNotification.create({
        data: {
          customerId: (
            await tx.eventInstallmentAgreement.findUniqueOrThrow({
              where: { id: input.agreementId },
              select: { customerId: true },
            })
          ).customerId,
          agreementId: input.agreementId,
          scheduleId: input.scheduleId,
          notificationType: "LATE_FEE_APPLIED",
          channels: ["SMS"],
          status: "PENDING",
        },
      });

      return {
        applied: true,
        lateFee: toLateFeeDomain(lateFee),
      };
    });
  }

  async waiveLateFee(input: {
    lateFeeId: string;
    waivedBy: string;
    reason: string;
    now: Date;
  }): Promise<{ waived: boolean; lateFee: EventInstallmentLateFee | null }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.eventInstallmentLateFee.updateMany({
        where: { id: input.lateFeeId, status: "APPLIED" },
        data: { status: "WAIVED", waivedAt: input.now, waivedBy: input.waivedBy },
      });
      if (claimed.count === 0) {
        return { waived: false, lateFee: null };
      }
      const lateFee = await tx.eventInstallmentLateFee.findUniqueOrThrow({
        where: { id: input.lateFeeId },
      });

      const schedule = await tx.eventInstallmentSchedule.update({
        where: { id: lateFee.scheduleId },
        data: {
          lateFeeAmountMinor: { decrement: lateFee.amountMinor },
          amountDueMinor: { decrement: lateFee.amountMinor },
        },
      });
      await tx.eventInstallmentSchedule.update({
        where: { id: lateFee.scheduleId },
        data: {
          outstandingAmountMinor: outstandingFor(
            schedule.amountDueMinor,
            schedule.amountPaidMinor,
            schedule.refundedAmountMinor,
          ),
        },
      });
      await this.reconcileAgreementTx(tx, lateFee.agreementId, input.now);

      await tx.eventInstallmentAuditLog.create({
        data: {
          actorId: input.waivedBy,
          action: "late_fee.waived",
          entityType: "EventInstallmentLateFee",
          entityId: lateFee.id,
          newValues: { amount_minor: lateFee.amountMinor.toString(10) },
          reason: input.reason,
        },
      });
      return {
        waived: true,
        lateFee: toLateFeeDomain(lateFee),
      };
    });
  }

  async listLateFees(input: {
    page: number;
    limit: number;
    agreementId?: string | undefined;
  }): Promise<{ items: EventInstallmentLateFee[]; total: number }> {
    const where: Prisma.EventInstallmentLateFeeWhereInput = {
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentLateFee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { schedule: true, agreement: true },
      }),
      this.prisma.eventInstallmentLateFee.count({ where }),
    ]);
    return { items: rows.map(toLateFeeDomain), total };
  }


  async sweepOverdueSchedules(input: {
    now: Date;
    applyLateFees: boolean;
  }): Promise<{
    markedOverdue: number;
    lateFeesApplied: number;
    notificationsCreated: number;
  }> {
    const candidates = await this.prisma.eventInstallmentSchedule.findMany({
      where: {
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        agreement: { status: { in: ["ACTIVE", "OVERDUE"] } },
      },
      include: {
        agreement: { include: { schedules: true, plan: true, event: true } },
      },
    });

    let markedOverdue = 0;
    let lateFeesApplied = 0;
    let notificationsCreated = 0;

    for (const candidate of candidates) {
      const agreement = toAgreementDomain(candidate.agreement);
      if (!isScheduleOverdue(candidate, agreement.gracePeriodDays, input.now)) {
        continue;
      }

      const claimed = await this.prisma.eventInstallmentSchedule.updateMany({
        where: {
          id: candidate.id,
          status: { in: ["PENDING", "PARTIALLY_PAID"] },
        },
        data: { status: "OVERDUE" },
      });
      if (claimed.count === 0) continue;
      markedOverdue += 1;

      await this.prisma.eventInstallmentNotification.create({
        data: {
          customerId: agreement.customerId,
          agreementId: agreement.id,
          scheduleId: candidate.id,
          notificationType: "OVERDUE_NOTICE",
          channels: ["SMS"],
          status: "PENDING",
        },
      });
      notificationsCreated += 1;

      if (input.applyLateFees && agreement.lateFeeValue > 0n) {
        const amount = computeLateFeeAmount(
          { feeType: agreement.lateFeeType, value: agreement.lateFeeValue },
          candidate.amountDueMinor,
        );
        if (amount > 0n) {
          const result = await this.applyLateFee({
            agreementId: agreement.id,
            scheduleId: candidate.id,
            feeType: agreement.lateFeeType,
            amountMinor: amount,
            reason: "Automatic late fee applied by overdue sweep",
            now: input.now,
          });
          if (result.applied) lateFeesApplied += 1;
        }
      }

      await this.reconcileAgreement(agreement.id, input.now);
    }

    return { markedOverdue, lateFeesApplied, notificationsCreated };
  }


  async createNotification(input: {
    customerId: string;
    agreementId: string | null;
    scheduleId: string | null;
    notificationType: InstallmentNotificationType;
    channels: InstallmentNotificationChannel[];
  }): Promise<EventInstallmentNotification> {
    const row = await this.prisma.eventInstallmentNotification.create({
      data: {
        customerId: input.customerId,
        agreementId: input.agreementId,
        scheduleId: input.scheduleId,
        notificationType: input.notificationType,
        channels: input.channels,
        status: "PENDING",
      },
    });
    return toNotificationDomain(row);
  }

  async listNotifications(input: {
    page: number;
    limit: number;
    customerId?: string | undefined;
    agreementId?: string | undefined;
    statuses?: InstallmentNotificationStatusList | undefined;
  }): Promise<{
    items: Array<EventInstallmentNotification & { customer: CustomerSummary }>;
    total: number;
  }> {
    const where: Prisma.EventInstallmentNotificationWhereInput = {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
      ...(input.statuses ? { status: { in: input.statuses } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          customer: {
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
      this.prisma.eventInstallmentNotification.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...toNotificationDomain(row),
        customer: row.customer,
      })),
      total,
    };
  }

  async findNotificationById(
    id: string,
  ): Promise<EventInstallmentNotification | null> {
    const row = await this.prisma.eventInstallmentNotification.findUnique({
      where: { id },
    });
    return row ? toNotificationDomain(row) : null;
  }

  async markNotificationSent(
    id: string,
    sent: boolean,
    now: Date,
  ): Promise<void> {
    await this.prisma.eventInstallmentNotification.update({
      where: { id },
      data: {
        status: sent ? "SENT" : "FAILED",
        sentAt: sent ? now : null,
      },
    });
  }


  async createAuditLog(input: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValues: Record<string, unknown> | null;
    newValues: Record<string, unknown>;
    reason: string | null;
  }): Promise<void> {
    await this.prisma.eventInstallmentAuditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        previousValues:
          input.previousValues === null
            ? Prisma.DbNull
            : (input.previousValues as Prisma.InputJsonValue),
        newValues: input.newValues as Prisma.InputJsonValue,
        reason: input.reason,
      },
    });
  }

  async listAuditLogs(input: {
    page: number;
    limit: number;
    entityType?: string | undefined;
    entityId?: string | undefined;
  }): Promise<{ items: Array<EventInstallmentAuditLog & { actor: CustomerSummary | null }>; total: number }> {
    const where: Prisma.EventInstallmentAuditLogWhereInput = {
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.eventInstallmentAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: {
          actor: {
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
      this.prisma.eventInstallmentAuditLog.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({ ...toAuditLogDomain(row), actor: row.actor })),
      total,
    };
  }


  async reportSummary(input: {
    createdFrom?: Date | undefined;
    createdTo?: Date | undefined;
  }): Promise<{
    totalAgreements: number;
    byStatus: Record<AgreementStatus, number>;
    totalExpectedMinor: bigint;
    totalCollectedMinor: bigint;
    totalRefundedMinor: bigint;
    totalOutstandingMinor: bigint;
    totalLateFeesMinor: bigint;
    overdueBalanceMinor: bigint;
  }> {
    const where: Prisma.EventInstallmentAgreementWhereInput = {
      ...(input.createdFrom || input.createdTo
        ? {
            createdAt: {
              ...(input.createdFrom ? { gte: input.createdFrom } : {}),
              ...(input.createdTo ? { lte: input.createdTo } : {}),
            },
          }
        : {}),
    };
    const [grouped, totals, overdue] = await Promise.all([
      this.prisma.eventInstallmentAgreement.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      this.prisma.eventInstallmentAgreement.aggregate({
        where,
        _sum: {
          totalPayableMinor: true,
          lateFeesTotalMinor: true,
          amountPaidMinor: true,
          refundedAmountMinor: true,
          outstandingBalanceMinor: true,
        },
        _count: { _all: true },
      }),
      this.prisma.eventInstallmentSchedule.aggregate({
        where: { status: "OVERDUE" },
        _sum: { outstandingAmountMinor: true },
      }),
    ]);

    const byStatus = {
      DRAFT: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      OVERDUE: 0,
      CANCELLED: 0,
      SUSPENDED: 0,
    } as Record<AgreementStatus, number>;
    for (const group of grouped) {
      byStatus[group.status] = group._count._all;
    }

    return {
      totalAgreements: totals._count._all,
      byStatus,
      totalExpectedMinor:
        (totals._sum.totalPayableMinor ?? 0n) +
        (totals._sum.lateFeesTotalMinor ?? 0n),
      totalCollectedMinor: totals._sum.amountPaidMinor ?? 0n,
      totalRefundedMinor: totals._sum.refundedAmountMinor ?? 0n,
      totalOutstandingMinor: totals._sum.outstandingBalanceMinor ?? 0n,
      totalLateFeesMinor: totals._sum.lateFeesTotalMinor ?? 0n,
      overdueBalanceMinor: overdue._sum.outstandingAmountMinor ?? 0n,
    };
  }

  async reportRecentPayments(input: {
    limit: number;
    customerId?: string | undefined;
    eventId?: string | undefined;
  }): Promise<EventInstallmentPayment[]> {
    const rows = await this.prisma.eventInstallmentPayment.findMany({
      where: {
        ...(input.customerId ? { customerId: input.customerId } : {}),
        agreement: input.eventId ? { eventId: input.eventId } : {},
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      include: {
        agreement: { include: { event: true } },
        schedule: true,
        refunds: true,
      },
    });
    return rows.map(toPaymentDomain);
  }

  async reportUpcomingSchedules(input: {
    limit: number;
    from: Date;
    to: Date;
    customerId?: string | undefined;
  }): Promise<
    Array<{ schedule: EventInstallmentSchedule; agreement: EventInstallmentAgreement }>
  > {
    const rows = await this.prisma.eventInstallmentSchedule.findMany({
      where: {
        dueDate: { gte: input.from, lte: input.to },
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        agreement: {
          status: { in: ["ACTIVE", "OVERDUE"] },
          ...(input.customerId ? { customerId: input.customerId } : {}),
        },
      },
      orderBy: { dueDate: "asc" },
      take: input.limit,
      include: {
        agreement: { include: { schedules: true, plan: true, event: true } },
      },
    });
    return rows.map((row) => ({
      schedule: toScheduleDomain(row),
      agreement: toAgreementDomain(row.agreement),
    }));
  }


  /**
   * Recomputes every schedule status and the agreement balances from the
   * schedule rows. Safe to run repeatedly; it is the single source of truth
   * for balances after any financial mutation outside a transaction.
   */
  async refreshAgreement(
    agreementId: string,
    now: Date,
  ): Promise<EventInstallmentAgreement> {
    return this.reconcileAgreement(agreementId, now);
  }

  private async reconcileAgreement(
    agreementId: string,
    now: Date,
  ): Promise<EventInstallmentAgreement> {
    return this.reconcileAgreementTx(this.prisma, agreementId, now);
  }

  private async reconcileAgreementTx(
    tx: Prisma.TransactionClient,
    agreementId: string,
    now: Date,
  ): Promise<EventInstallmentAgreement> {
    const agreementRow = await tx.eventInstallmentAgreement.findUniqueOrThrow({
      where: { id: agreementId },
    });
    const scheduleRows = await tx.eventInstallmentSchedule.findMany({
      where: { agreementId },
      orderBy: { installmentNumber: "asc" },
    });

    for (const scheduleRow of scheduleRows) {
      if (
        scheduleRow.status === "WAIVED" ||
        scheduleRow.status === "CANCELLED"
      ) {
        continue;
      }
      const outstanding = outstandingFor(
        scheduleRow.amountDueMinor,
        scheduleRow.amountPaidMinor,
        scheduleRow.refundedAmountMinor,
      );
      const overdue = isScheduleOverdue(scheduleRow, agreementRow.gracePeriodDays, now);
      const nextStatus: ScheduleStatus =
        outstanding <= 0n
          ? "PAID"
          : overdue
            ? "OVERDUE"
            : scheduleRow.amountPaidMinor > 0n
              ? "PARTIALLY_PAID"
              : "PENDING";
      if (nextStatus !== scheduleRow.status) {
        await tx.eventInstallmentSchedule.update({
          where: { id: scheduleRow.id },
          data: { status: nextStatus },
        });
      }
    }

    const refreshed = await tx.eventInstallmentSchedule.findMany({
      where: { agreementId },
      orderBy: { installmentNumber: "asc" },
    });
    const schedules = refreshed.map(toScheduleDomain);

    let amountPaidMinor = 0n;
    let refundedAmountMinor = 0n;
    let lateFeesTotalMinor = 0n;
    let outstandingBalanceMinor = 0n;
    for (const schedule of schedules) {
      amountPaidMinor += schedule.amountPaidMinor;
      refundedAmountMinor += schedule.refundedAmountMinor;
      lateFeesTotalMinor += schedule.lateFeeAmountMinor;
      if (countsTowardsOutstanding(schedule.status)) {
        outstandingBalanceMinor += outstandingFor(
          schedule.amountDueMinor,
          schedule.amountPaidMinor,
          schedule.refundedAmountMinor,
        );
      }
    }

    const status = agreementStatusForSchedules(
      schedules,
      agreementRow.status,
    );

    const updated = await tx.eventInstallmentAgreement.update({
      where: { id: agreementId },
      data: {
        amountPaidMinor,
        refundedAmountMinor,
        lateFeesTotalMinor,
        outstandingBalanceMinor,
        status,
      },
      include: { schedules: true, plan: true, event: true },
    });
    return toAgreementDomain(updated);
  }

  private async reopenCompletedAgreementInTx(
    tx: Tx,
    agreementId: string,
  ): Promise<void> {
    await tx.eventInstallmentAgreement.updateMany({
      where: { id: agreementId, status: "COMPLETED" },
      data: { status: "ACTIVE" },
    });
  }
}

type InstallmentNotificationStatusList = Array<"PENDING" | "SENT" | "FAILED">;

function toPlanDomain(row: PrismaPlan): EventInstallmentPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    frequency: row.frequency,
    intervalCount: row.intervalCount,
    installmentCount: row.installmentCount,
    initialPaymentType: row.initialPaymentType,
    initialPaymentValue: row.initialPaymentValue,
    interestRateBps: row.interestRateBps,
    lateFeeType: row.lateFeeType,
    lateFeeValue: row.lateFeeValue,
    gracePeriodDays: row.gracePeriodDays,
    allowPartialPayment: row.allowPartialPayment,
    allowEarlyPayment: row.allowEarlyPayment,
    currency: row.currency,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAgreementDomain(row: PrismaAgreement): EventInstallmentAgreement {
  return {
    id: row.id,
    customerId: row.customerId,
    eventId: row.eventId,
    planId: row.planId,
    totalAmountMinor: row.totalAmountMinor,
    initialPaymentMinor: row.initialPaymentMinor,
    interestAmountMinor: row.interestAmountMinor,
    totalPayableMinor: row.totalPayableMinor,
    amountPaidMinor: row.amountPaidMinor,
    refundedAmountMinor: row.refundedAmountMinor,
    lateFeesTotalMinor: row.lateFeesTotalMinor,
    outstandingBalanceMinor: row.outstandingBalanceMinor,
    currency: row.currency,
    frequency: row.frequency,
    intervalCount: row.intervalCount,
    installmentCount: row.installmentCount,
    gracePeriodDays: row.gracePeriodDays,
    lateFeeType: row.lateFeeType,
    lateFeeValue: row.lateFeeValue,
    allowPartialPayment: row.allowPartialPayment,
    allowEarlyPayment: row.allowEarlyPayment,
    startDate: row.startDate,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toScheduleDomain(row: PrismaSchedule): EventInstallmentSchedule {
  return {
    id: row.id,
    agreementId: row.agreementId,
    installmentNumber: row.installmentNumber,
    isInitialPayment: row.isInitialPayment,
    dueDate: row.dueDate,
    principalAmountMinor: row.principalAmountMinor,
    interestAmountMinor: row.interestAmountMinor,
    lateFeeAmountMinor: row.lateFeeAmountMinor,
    amountDueMinor: row.amountDueMinor,
    amountPaidMinor: row.amountPaidMinor,
    refundedAmountMinor: row.refundedAmountMinor,
    outstandingAmountMinor: row.outstandingAmountMinor,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPaymentDomain(row: PrismaPayment): EventInstallmentPayment {
  return {
    id: row.id,
    agreementId: row.agreementId,
    scheduleId: row.scheduleId,
    customerId: row.customerId,
    paymentIntentId: row.paymentIntentId,
    source: row.source,
    amountMinor: row.amountMinor,
    refundedAmountMinor: row.refundedAmountMinor,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    transactionReference: row.transactionReference,
    status: row.status,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRefundDomain(row: PrismaRefund): EventInstallmentRefund {
  return {
    id: row.id,
    installmentPaymentId: row.installmentPaymentId,
    amountMinor: row.amountMinor,
    reason: row.reason,
    status: row.status,
    providerRefundReference: row.providerRefundReference,
    rejectionReason: row.rejectionReason,
    processedBy: row.processedBy,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
    payment: {
      id: row.payment.id,
      amountMinor: row.payment.amountMinor,
      status: row.payment.status,
      agreementId: row.payment.agreementId,
      scheduleId: row.payment.scheduleId,
    },
  };
}

function toLateFeeDomain(row: PrismaLateFee): EventInstallmentLateFee {
  return {
    id: row.id,
    agreementId: row.agreementId,
    scheduleId: row.scheduleId,
    feeType: row.feeType,
    amountMinor: row.amountMinor,
    reason: row.reason,
    status: row.status,
    appliedAt: row.appliedAt,
    waivedAt: row.waivedAt,
    waivedBy: row.waivedBy,
    createdAt: row.createdAt,
  };
}

function toNotificationDomain(
  row: PrismaNotification,
): EventInstallmentNotification {
  return {
    id: row.id,
    customerId: row.customerId,
    agreementId: row.agreementId,
    scheduleId: row.scheduleId,
    notificationType: row.notificationType,
    channels: row.channels,
    status: row.status,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

function toAuditLogDomain(row: PrismaAuditLog): EventInstallmentAuditLog {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    previousValues: (row.previousValues ?? null) as Record<string, unknown> | null,
    newValues: row.newValues as Record<string, unknown>,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export { UUID_REGEX };
