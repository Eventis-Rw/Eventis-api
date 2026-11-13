import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";


import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import type { EventInstallmentLateFee } from "../domain/installment-payment.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

@Injectable()
export class InstallmentLateFeesService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Applies a late fee to a schedule. One fee per fee type per schedule —
   * the unique (scheduleId, feeType) constraint plus the APPLIED status guard
   * make repeated sweeps idempotent.
   */
  async apply(
    actor: { userId: string },
    input: {
      scheduleId: string;
      amountMinor: bigint;
      reason: string;
    },
  ): Promise<{ lateFee: EventInstallmentLateFee; alreadyApplied: boolean }> {
    const found = await this.installments.findScheduleWithAgreement(
      input.scheduleId,
    );
    if (!found) throw AppError.notFound("Schedule");
    if (found.schedule.status !== "OVERDUE") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Late fees apply to overdue installments only (this one is ${found.schedule.status})`,
      );
    }
    if (input.amountMinor <= 0n) {
      throw AppError.validation({
        amount_minor: ["amount_minor must be positive"],
      });
    }
    if (input.reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A reason of at least 3 characters is required"],
      });
    }

    const result = await this.installments.applyLateFee({
      agreementId: found.agreement.id,
      scheduleId: found.schedule.id,
      feeType: found.agreement.lateFeeType,
      amountMinor: input.amountMinor,
      reason: input.reason,
      now: this.clock.now(),
    });
    if (!result.lateFee) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "The late fee could not be applied. Reload the schedule and try again.",
      );
    }
    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: result.applied ? "late_fee.applied" : "late_fee.already_applied",
      entityType: "EventInstallmentLateFee",
      entityId: result.lateFee.id,
      previousValues: null,
      newValues: {
        schedule_id: found.schedule.id,
        amount_minor: input.amountMinor.toString(10),
      },
      reason: input.reason,
    });
    return { lateFee: result.lateFee, alreadyApplied: !result.applied };
  }

  async waive(
    actor: { userId: string },
    lateFeeId: string,
    reason: string,
  ): Promise<EventInstallmentLateFee> {
    if (reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A waiver reason of at least 3 characters is required"],
      });
    }
    const result = await this.installments.waiveLateFee({
      lateFeeId,
      waivedBy: actor.userId,
      reason,
      now: this.clock.now(),
    });
    if (!result.waived || !result.lateFee) {
      const existing = result.lateFee;
      if (existing && existing.status === "WAIVED") {
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "This late fee was already waived",
        );
      }
      if (!existing) throw AppError.notFound("Late fee");
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "The late fee was waived concurrently. Reload and try again.",
      );
    }
    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "late_fee.waived",
      entityType: "EventInstallmentLateFee",
      entityId: lateFeeId,
      previousValues: { status: "APPLIED" },
      newValues: { status: "WAIVED" },
      reason,
    });
    return result.lateFee;
  }

  async list(input: {
    page: number;
    limit: number;
    agreementId?: string | undefined;
    scheduleId?: string | undefined;
  }): Promise<{ items: EventInstallmentLateFee[]; total: number }> {
    return this.installments.listLateFees(input);
  }
}

