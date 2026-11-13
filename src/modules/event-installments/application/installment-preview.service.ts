import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import {
  generateSchedule,
  type AgreementTerms,
  type ScheduledInstallment,
} from "../domain/installment-calculation.js";
import {
  initialPaymentFor,
  validatePlanTerms,
  type EventInstallmentPlan,
} from "../domain/installment-plan.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

export interface PreviewInput {
  planId: string;
  totalAmountMinor: bigint;
  currency: string;
  startDate: Date;
}

export interface InstallmentPreview {
  readonly terms: AgreementTerms;
  readonly installments: ScheduledInstallment[];
}

@Injectable()
export class InstallmentPreviewService {
  constructor(private readonly installments: EventInstallmentRepository) {}

  /**
   * Computes what an agreement would look like. Creates nothing, collects
   * nothing — the same engine that generates real schedules so the preview
   * can never disagree with the assignment.
   */
  async preview(input: PreviewInput): Promise<InstallmentPreview> {
    const plan = await this.installments.findPlanById(input.planId);
    if (!plan) throw AppError.notFound("Installment plan");
    if (!plan.isActive) {
      throw AppError.validation({
        plan_id: ["This installment plan is not available"],
      });
    }
    return this.previewForPlan(plan, {
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      startDate: input.startDate,
    });
  }

  previewForPlan(
    plan: EventInstallmentPlan,
    input: { totalAmountMinor: bigint; currency: string; startDate: Date },
  ): InstallmentPreview {
    try {
      validatePlanTerms({
        name: plan.name,
        intervalCount: plan.intervalCount,
        installmentCount: plan.installmentCount,
        interestRateBps: plan.interestRateBps,
        initialPaymentValue: plan.initialPaymentValue,
        lateFeeValue: plan.lateFeeValue,
        gracePeriodDays: plan.gracePeriodDays,
        currency: input.currency,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid preview terms";
      throw AppError.validation({ installment_plan: [message] });
    }
    if (input.totalAmountMinor <= 0n) {
      throw AppError.validation({
        total_amount_minor: ["total_amount_minor must be positive"],
      });
    }

    const initialPaymentMinor = initialPaymentFor(plan, input.totalAmountMinor);
    const installments = generateSchedule({
      totalAmountMinor: input.totalAmountMinor,
      initialPaymentMinor,
      interestRateBps: plan.interestRateBps,
      installmentCount: plan.installmentCount,
      frequency: plan.frequency,
      intervalCount: plan.intervalCount,
      startDate: input.startDate,
    });

    return {
      terms: {
        totalAmountMinor: input.totalAmountMinor,
        initialPaymentMinor,
        financedAmountMinor: input.totalAmountMinor - initialPaymentMinor,
        interestAmountMinor: installments
          .filter((row) => !row.isInitialPayment)
          .reduce((sum, row) => sum + row.interestAmountMinor, 0n),
        totalPayableMinor: installments.reduce(
          (sum, row) => sum + row.amountDueMinor,
          0n,
        ),
      },
      installments,
    };
  }
}
