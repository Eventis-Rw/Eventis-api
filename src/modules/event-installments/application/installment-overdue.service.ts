import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

export interface OverdueSweepResult {
  readonly markedOverdue: number;
  readonly lateFeesApplied: number;
  readonly notificationsCreated: number;
}

/**
 * Overdue detection. There is no scheduler in this deployment, so the sweep
 * is an idempotent admin-triggered job: POST it as often as you like —
 * compare-and-swap status transitions mean only the first caller moves a
 * schedule to OVERDUE, and late fees are deduplicated per (schedule, fee
 * type). Notifications are only created on the transition itself.
 */
@Injectable()
export class InstallmentOverdueService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly clock: Clock,
  ) {}

  async sweep(input: { applyLateFees: boolean }): Promise<OverdueSweepResult> {
    return this.installments.sweepOverdueSchedules({
      now: this.clock.now(),
      applyLateFees: input.applyLateFees,
    });
  }
}
