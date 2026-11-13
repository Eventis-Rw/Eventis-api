import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";


import { AppError } from "../../../common/errors/app-error.js";
import {
  canTransitionAgreement,
  isTerminalAgreementStatus,
  type AgreementStatus,
  type EventInstallmentAgreement,
} from "../domain/installment-agreement.js";
import {
  generateSchedule,
  generateScheduleFromAmounts,
  type AgreementTerms,
} from "../domain/installment-calculation.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

import { InstallmentPreviewService } from "./installment-preview.service.js";

export interface AccessUser {
  readonly userId: string;
  readonly roles: string[];
  readonly role: string;
}

export interface AssignPlanInput {
  customerId: string;
  eventId: string;
  planId: string;
  totalAmountMinor: bigint;
  startDate: Date;
  status: "DRAFT" | "ACTIVE";
}

export interface CustomAgreementInput {
  customerId: string;
  eventId: string;
  totalAmountMinor: bigint;
  initialPaymentMinor: bigint;
  interestRateBps: number;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  intervalCount: number;
  installmentCount: number;
  startDate: Date;
  gracePeriodDays: number;
  lateFeeType: "FIXED" | "PERCENT";
  lateFeeValue: bigint;
  allowPartialPayment: boolean;
  allowEarlyPayment: boolean;
  status: "DRAFT" | "ACTIVE";
}

export interface ReviseInput {
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  intervalCount: number;
  installmentCount: number;
  startDate: Date;
  allowPartialPayment: boolean;
  allowEarlyPayment: boolean;
  reason: string;
}

@Injectable()
export class InstallmentAgreementsService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly preview: InstallmentPreviewService,
  ) {}

  async assign(
    actor: AccessUser,
    input: AssignPlanInput,
  ): Promise<EventInstallmentAgreement> {
    const plan = await this.installments.findPlanById(input.planId);
    if (!plan) throw AppError.notFound("Installment plan");
    if (!plan.isActive) {
      throw AppError.validation({
        plan_id: ["This installment plan is not available"],
      });
    }

    await this.validateContext(input.customerId, input.eventId);
    const preview = this.preview.previewForPlan(plan, {
      totalAmountMinor: input.totalAmountMinor,
      currency: plan.currency,
      startDate: input.startDate,
    });

    const agreement = await this.installments.createAgreement({
      customerId: input.customerId,
      eventId: input.eventId,
      planId: plan.id,
      totalAmountMinor: preview.terms.totalAmountMinor,
      initialPaymentMinor: preview.terms.initialPaymentMinor,
      interestAmountMinor: preview.terms.interestAmountMinor,
      totalPayableMinor: preview.terms.totalPayableMinor,
      outstandingBalanceMinor: preview.terms.totalPayableMinor,
      currency: plan.currency,
      frequency: plan.frequency,
      intervalCount: plan.intervalCount,
      installmentCount: plan.installmentCount,
      gracePeriodDays: plan.gracePeriodDays,
      lateFeeType: plan.lateFeeType,
      lateFeeValue: plan.lateFeeValue,
      allowPartialPayment: plan.allowPartialPayment,
      allowEarlyPayment: plan.allowEarlyPayment,
      startDate: input.startDate,
      status: input.status,
      schedules: preview.installments.map((row) => ({
        installmentNumber: row.installmentNumber,
        isInitialPayment: row.isInitialPayment,
        dueDate: row.dueDate,
        principalAmountMinor: row.principalAmountMinor,
        interestAmountMinor: row.interestAmountMinor,
        amountDueMinor: row.amountDueMinor,
        outstandingAmountMinor: row.amountDueMinor,
      })),
    });

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "agreement.created",
      entityType: "EventInstallmentAgreement",
      entityId: agreement.id,
      previousValues: null,
      newValues: {
        customer_id: agreement.customerId,
        event_id: agreement.eventId,
        plan_id: agreement.planId,
        total_payable_minor: agreement.totalPayableMinor.toString(10),
        status: agreement.status,
      },
      reason: null,
    });
    return agreement;
  }

  async createCustom(
    actor: AccessUser,
    input: CustomAgreementInput,
  ): Promise<EventInstallmentAgreement> {
    await this.validateContext(input.customerId, input.eventId);

    if (input.totalAmountMinor <= 0n) {
      throw AppError.validation({
        total_amount_minor: ["total_amount_minor must be positive"],
      });
    }
    if (
      input.initialPaymentMinor < 0n ||
      input.initialPaymentMinor > input.totalAmountMinor
    ) {
      throw AppError.validation({
        initial_payment_minor: [
          "initial_payment_minor must be between 0 and the total amount",
        ],
      });
    }
    if (input.installmentCount < 1 || input.intervalCount < 1) {
      throw AppError.validation({
        installment_count: ["Counts must be at least 1"],
      });
    }

    const generated = generateSchedule({
      totalAmountMinor: input.totalAmountMinor,
      initialPaymentMinor: input.initialPaymentMinor,
      interestRateBps: input.interestRateBps,
      installmentCount: input.installmentCount,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
    });
    const terms: AgreementTerms = {
      totalAmountMinor: input.totalAmountMinor,
      initialPaymentMinor: input.initialPaymentMinor,
      financedAmountMinor: input.totalAmountMinor - input.initialPaymentMinor,
      interestAmountMinor: generated
        .filter((row) => !row.isInitialPayment)
        .reduce((sum, row) => sum + row.interestAmountMinor, 0n),
      totalPayableMinor: generated.reduce(
        (sum, row) => sum + row.amountDueMinor,
        0n,
      ),
    };

    const agreement = await this.installments.createAgreement({
      customerId: input.customerId,
      eventId: input.eventId,
      planId: null,
      totalAmountMinor: terms.totalAmountMinor,
      initialPaymentMinor: terms.initialPaymentMinor,
      interestAmountMinor: terms.interestAmountMinor,
      totalPayableMinor: terms.totalPayableMinor,
      outstandingBalanceMinor: terms.totalPayableMinor,
      currency: "RWF",
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
      schedules: generated.map((row) => ({
        installmentNumber: row.installmentNumber,
        isInitialPayment: row.isInitialPayment,
        dueDate: row.dueDate,
        principalAmountMinor: row.principalAmountMinor,
        interestAmountMinor: row.interestAmountMinor,
        amountDueMinor: row.amountDueMinor,
        outstandingAmountMinor: row.amountDueMinor,
      })),
    });

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "agreement.created",
      entityType: "EventInstallmentAgreement",
      entityId: agreement.id,
      previousValues: null,
      newValues: {
        customer_id: agreement.customerId,
        event_id: agreement.eventId,
        plan_id: null,
        total_payable_minor: agreement.totalPayableMinor.toString(10),
        status: agreement.status,
        custom: true,
      },
      reason: null,
    });
    return agreement;
  }

  async get(
    actor: AccessUser,
    id: string,
  ): Promise<EventInstallmentAgreement> {
    const agreement = await this.installments.findAgreementById(id);
    if (!agreement) throw AppError.notFound("Agreement");
    await this.assertAccess(actor, agreement);
    return agreement;
  }

  async list(
    actor: AccessUser,
    input: {
      page: number;
      limit: number;
      customerId?: string | undefined;
      eventId?: string | undefined;
      statuses?: AgreementStatus[] | undefined;
      createdFrom?: Date | undefined;
      createdTo?: Date | undefined;
    },
  ): Promise<{ items: EventInstallmentAgreement[]; total: number }> {
    // Non-admins only ever see agreements where they are the customer or the
    // event poster. The repository scope is forced here, never trusted from
    // the query string.
    if (isAdmin(actor)) {
      return this.installments.listAgreements(input);
    }
    const scoped: typeof input = {
      ...input,
      customerId: input.customerId === actor.userId
        ? input.customerId
        : undefined,
      eventId: input.eventId,
    };
    const result = await this.installments.listAgreements(scoped);
    const eventIds = [...new Set(result.items.map((row) => row.eventId))];
    const owned = new Set<string>();
    for (const eventId of eventIds) {
      const event = await this.installments.findEventById(eventId);
      if (event && event.posterId === actor.userId) {
        owned.add(eventId);
      }
    }
    const items = result.items.filter(
      (row) =>
        row.customerId === actor.userId || owned.has(row.eventId),
    );
    return { items, total: items.length };
  }

  /**
   * Revision regenerates schedules. Only allowed before any money has been
   * collected — after that, history is immutable and the admin must cancel
   * and re-assign instead. Paid records are never rewritten.
   */
  async revise(
    actor: AccessUser,
    id: string,
    input: ReviseInput,
  ): Promise<EventInstallmentAgreement> {
    const agreement = await this.get(actor, id);
    if (isTerminalAgreementStatus(agreement.status)) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "A completed or cancelled agreement cannot be revised. Create a new agreement instead.",
      );
    }
    if (agreement.amountPaidMinor > 0n) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This agreement has collected payments and cannot be revised. Cancel it and create a new agreement instead.",
      );
    }
    if (input.installmentCount < 1 || input.intervalCount < 1) {
      throw AppError.validation({
        installment_count: ["Counts must be at least 1"],
      });
    }
    if (input.reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A revision reason of at least 3 characters is required"],
      });
    }

    // The agreement is unpaid, so the interest snapshot and payable totals
    // are redistributed across the new installment count. Money is never
    // rewritten after collection — this path is guarded above.
    const generated = generateScheduleFromAmounts({
      totalAmountMinor: agreement.totalAmountMinor,
      initialPaymentMinor: agreement.initialPaymentMinor,
      interestAmountMinor: agreement.interestAmountMinor,
      installmentCount: input.installmentCount,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
    });

    const updated = await this.installments.reviseAgreementSchedules(
      agreement.id,
      {
        frequency: input.frequency,
        intervalCount: input.intervalCount,
        installmentCount: input.installmentCount,
        startDate: input.startDate,
        allowPartialPayment: input.allowPartialPayment,
        allowEarlyPayment: input.allowEarlyPayment,
      },
      {
        totalAmountMinor: agreement.totalAmountMinor,
        initialPaymentMinor: agreement.initialPaymentMinor,
        interestAmountMinor: generated
          .filter((row) => !row.isInitialPayment)
          .reduce((sum, row) => sum + row.interestAmountMinor, 0n),
        totalPayableMinor: generated.reduce(
          (sum, row) => sum + row.amountDueMinor,
          0n,
        ),
        outstandingBalanceMinor: generated.reduce(
          (sum, row) => sum + row.amountDueMinor,
          0n,
        ),
      },
      generated.map((row) => ({
        installmentNumber: row.installmentNumber,
        isInitialPayment: row.isInitialPayment,
        dueDate: row.dueDate,
        principalAmountMinor: row.principalAmountMinor,
        interestAmountMinor: row.interestAmountMinor,
        amountDueMinor: row.amountDueMinor,
        outstandingAmountMinor: row.amountDueMinor,
      })),
    );

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "agreement.revised",
      entityType: "EventInstallmentAgreement",
      entityId: agreement.id,
      previousValues: {
        frequency: agreement.frequency,
        interval_count: agreement.intervalCount,
        installment_count: agreement.installmentCount,
        start_date: agreement.startDate.toISOString(),
      },
      newValues: {
        frequency: input.frequency,
        interval_count: input.intervalCount,
        installment_count: input.installmentCount,
        start_date: input.startDate.toISOString(),
      },
      reason: input.reason,
    });
    return updated;
  }

  async transitionStatus(
    actor: AccessUser,
    id: string,
    to: AgreementStatus,
    reason: string,
  ): Promise<EventInstallmentAgreement> {
    const agreement = await this.get(actor, id);
    if (reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A reason of at least 3 characters is required"],
      });
    }
    if (!canTransitionAgreement(agreement.status, to)) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `An agreement cannot move from ${agreement.status} to ${to}`,
      );
    }

    const updated = await this.installments.transitionAgreementStatus(
      agreement.id,
      [agreement.status],
      to,
    );
    if (!updated) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "The agreement status changed concurrently. Reload and try again.",
      );
    }

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: `agreement.status.${to.toLowerCase()}`,
      entityType: "EventInstallmentAgreement",
      entityId: agreement.id,
      previousValues: { status: agreement.status },
      newValues: { status: to },
      reason,
    });
    return updated;
  }

  /** Customer sees only their own agreement; event posters see theirs. */
  async getForCustomer(
    userId: string,
    id: string,
  ): Promise<EventInstallmentAgreement> {
    const agreement = await this.installments.findAgreementById(id);
    if (!agreement || agreement.customerId !== userId) {
      throw AppError.notFound("Agreement");
    }
    return agreement;
  }

  async listForCustomer(
    userId: string,
    input: { eventId?: string | undefined },
  ): Promise<EventInstallmentAgreement[]> {
    const result = await this.installments.listAgreements({
      page: 1,
      limit: 100,
      customerId: userId,
      ...(input.eventId ? { eventId: input.eventId } : {}),
    });
    return result.items;
  }

  private async validateContext(customerId: string, eventId: string) {
    const customer = await this.installments.findCustomerById(customerId);
    if (!customer) throw AppError.notFound("Customer");
    const event = await this.installments.findEventById(eventId);
    if (!event) throw AppError.notFound("Event");
  }

  private async assertAccess(
    actor: AccessUser,
    agreement: EventInstallmentAgreement,
  ): Promise<void> {
    if (isAdmin(actor)) return;
    if (actor.userId === agreement.customerId) return;
    const event = await this.installments.findEventById(agreement.eventId);
    if (event && event.posterId === actor.userId) return;
    throw AppError.forbidden("You do not have access to this agreement");
  }
}

export function isAdmin(actor: AccessUser): boolean {
  const roles = [actor.role, ...actor.roles];
  return roles.some((role) => role.toUpperCase() === "ADMIN");
}
