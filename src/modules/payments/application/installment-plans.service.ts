import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  defaultDurationDays,
  fromApiAccountType,
  fromApiInterval,
  type InstallmentPlan,
} from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";

@Injectable()
export class InstallmentPlansService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly clock: Clock,
  ) {}

  list(input: {
    accountType?: "private" | "public" | undefined;
    isActive?: boolean | undefined;
  }): Promise<InstallmentPlan[]> {
    return this.payments.listInstallmentPlans({
      accountType: input.accountType
        ? fromApiAccountType(input.accountType)
        : undefined,
      isActive: input.isActive,
    });
  }

  async create(input: {
    accountType: "private" | "public";
    interval: "weekly" | "monthly" | "yearly";
    durationDays?: number | undefined;
    priceMinor: bigint;
    isActive: boolean;
  }): Promise<InstallmentPlan> {
    const interval = fromApiInterval(input.interval);
    try {
      return await this.payments.createInstallmentPlan({
        accountType: fromApiAccountType(input.accountType),
        interval,
        durationDays: input.durationDays ?? defaultDurationDays(interval),
        priceMinor: input.priceMinor,
        isActive: input.isActive,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "An installment plan already exists for this account type and interval",
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: {
      interval?: "weekly" | "monthly" | "yearly" | undefined;
      durationDays?: number | undefined;
      priceMinor?: bigint | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<InstallmentPlan> {
    const plan = await this.payments.findInstallmentPlanById(id);
    if (!plan) throw AppError.notFound("Installment plan");

    try {
      return await this.payments.updateInstallmentPlan(id, {
        interval: input.interval ? fromApiInterval(input.interval) : undefined,
        durationDays: input.durationDays,
        priceMinor: input.priceMinor,
        isActive: input.isActive,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "An installment plan already exists for this account type and interval",
        );
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<InstallmentPlan> {
    const plan = await this.payments.findInstallmentPlanById(id);
    if (!plan) throw AppError.notFound("Installment plan");
    return this.payments.updateInstallmentPlan(id, { isActive });
  }

  now(): Date {
    return this.clock.now();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
