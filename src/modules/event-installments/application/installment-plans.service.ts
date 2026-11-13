import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import {
  validatePlanTerms,
  type EventInstallmentPlan,
} from "../domain/installment-plan.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

export interface CreatePlanInput {
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
}

export type UpdatePlanInput = Partial<CreatePlanInput>;

@Injectable()
export class InstallmentPlansService {
  constructor(private readonly installments: EventInstallmentRepository) {}

  list(input: { isActive?: boolean | undefined }): Promise<EventInstallmentPlan[]> {
    return this.installments.listPlans(input);
  }

  async find(id: string): Promise<EventInstallmentPlan> {
    const plan = await this.installments.findPlanById(id);
    if (!plan) throw AppError.notFound("Installment plan");
    return plan;
  }

  async create(input: CreatePlanInput): Promise<EventInstallmentPlan> {
    try {
      validatePlanTerms({
        name: input.name,
        intervalCount: input.intervalCount,
        installmentCount: input.installmentCount,
        interestRateBps: input.interestRateBps,
        initialPaymentValue: input.initialPaymentValue,
        lateFeeValue: input.lateFeeValue,
        gracePeriodDays: input.gracePeriodDays,
        currency: input.currency,
      });
    } catch (error) {
      throw planValidationError(error);
    }
    return this.installments.createPlan(input);
  }

  async update(id: string, input: UpdatePlanInput): Promise<EventInstallmentPlan> {
    const current = await this.find(id);
    const next = {
      name: input.name ?? current.name,
      intervalCount: input.intervalCount ?? current.intervalCount,
      installmentCount: input.installmentCount ?? current.installmentCount,
      interestRateBps: input.interestRateBps ?? current.interestRateBps,
      initialPaymentValue:
        input.initialPaymentValue ?? current.initialPaymentValue,
      lateFeeValue: input.lateFeeValue ?? current.lateFeeValue,
      gracePeriodDays: input.gracePeriodDays ?? current.gracePeriodDays,
      currency: input.currency ?? current.currency,
    };
    try {
      validatePlanTerms(next);
    } catch (error) {
      throw planValidationError(error);
    }
    return this.installments.updatePlan(id, {
      ...input,
      name: next.name,
    });
  }

  async setActive(id: string, isActive: boolean): Promise<EventInstallmentPlan> {
    await this.find(id);
    return this.installments.updatePlan(id, { isActive });
  }
}

function planValidationError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Invalid plan terms";
  return AppError.validation({ installment_plan: [message] });
}
