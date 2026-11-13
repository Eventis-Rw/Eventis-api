import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";


import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  isScheduleOverdue,
  type EventInstallmentSchedule,
  type ScheduleStatus,
} from "../domain/installment-agreement.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

import type { AccessUser } from "./installment-agreements.service.js";

@Injectable()
export class InstallmentSchedulesService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly clock: Clock,
  ) {}

  async list(
    actor: AccessUser,
    input: {
      agreementId: string;
      page: number;
      limit: number;
      statuses?: ScheduleStatus[] | undefined;
    },
  ): Promise<{ items: EventInstallmentSchedule[]; total: number }> {
    await this.assertAgreementAccess(actor, input.agreementId);
    const result = await this.installments.listSchedules(input);
    return {
      items: result.items.map((row) => row.schedule),
      total: result.total,
    };
  }

  /** Admin moves a due date for a schedule that has collected nothing yet. */
  async adjustDueDate(
    actor: AccessUser,
    scheduleId: string,
    dueDate: Date,
    reason: string,
  ): Promise<EventInstallmentSchedule> {
    if (reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A reason of at least 3 characters is required"],
      });
    }
    const found = await this.installments.findScheduleWithAgreement(scheduleId);
    if (!found) throw AppError.notFound("Schedule");
    if (found.schedule.amountPaidMinor > 0n) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "The due date of an installment that has collected payments cannot be adjusted",
      );
    }

    const updated = await this.installments.adjustScheduleDueDate(
      scheduleId,
      dueDate,
    );
    if (!updated) throw AppError.notFound("Schedule");

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "schedule.due_date_adjusted",
      entityType: "EventInstallmentSchedule",
      entityId: scheduleId,
      previousValues: {
        due_date: found.schedule.dueDate.toISOString(),
      },
      newValues: { due_date: dueDate.toISOString() },
      reason,
    });
    return updated;
  }

  /**
   * Waives the remaining amount of a schedule: the schedule stops counting
   * towards the outstanding balance, and the agreement status is recomputed
   * from the remaining schedules (a full waiver can complete an agreement).
   */
  async waive(
    actor: AccessUser,
    scheduleId: string,
    reason: string,
  ): Promise<EventInstallmentSchedule> {
    if (reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A waiver reason of at least 3 characters is required"],
      });
    }
    const found = await this.installments.findScheduleWithAgreement(scheduleId);
    if (!found) throw AppError.notFound("Schedule");
    const { schedule, agreement } = found;
    if (schedule.status === "PAID") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This installment is already fully paid",
      );
    }
    if (schedule.status === "WAIVED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This installment is already waived",
      );
    }
    if (agreement.status === "CANCELLED" || agreement.status === "COMPLETED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `This agreement is ${agreement.status}`,
      );
    }

    await this.installments.setScheduleStatus(scheduleId, "WAIVED");
    await this.installments.refreshAgreement(
      agreement.id,
      this.clock.now(),
    );

    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "schedule.waived",
      entityType: "EventInstallmentSchedule",
      entityId: scheduleId,
      previousValues: {
        status: schedule.status,
        outstanding_minor: schedule.outstandingAmountMinor.toString(10),
      },
      newValues: { status: "WAIVED" },
      reason,
    });

    const updated = await this.installments.findScheduleById(scheduleId);
    return updated ?? schedule;
  }

  /** Creates DUE_REMINDER notifications for schedules inside the window. */
  async dueReminders(input: {
    from: Date;
    to: Date;
    limit: number;
  }): Promise<number> {
    const rows = await this.installments.listSchedules({
      page: 1,
      limit: input.limit,
      dueFrom: input.from,
      dueTo: input.to,
      statuses: ["PENDING", "PARTIALLY_PAID"],
    });
    const now = this.clock.now();
    let created = 0;
    for (const { schedule, agreement } of rows.items) {
      if (
        agreement.status !== "ACTIVE" &&
        agreement.status !== "OVERDUE"
      ) {
        continue;
      }
      if (isScheduleOverdue(schedule, agreement.gracePeriodDays, now)) {
        continue;
      }
      await this.installments.createNotification({
        customerId: agreement.customerId,
        agreementId: agreement.id,
        scheduleId: schedule.id,
        notificationType: "DUE_REMINDER",
        channels: ["SMS"],
      });
      created += 1;
    }
    return created;
  }

  private async assertAgreementAccess(
    actor: AccessUser,
    agreementId: string,
  ): Promise<void> {
    const agreement = await this.installments.findAgreementById(agreementId);
    if (!agreement) throw AppError.notFound("Agreement");
    const roles = [actor.role, ...actor.roles];
    if (roles.some((role) => role.toUpperCase() === "ADMIN")) return;
    if (agreement.customerId === actor.userId) return;
    const event = await this.installments.findEventById(agreement.eventId);
    if (event && event.posterId === actor.userId) return;
    throw AppError.forbidden("You do not have access to this agreement");
  }
}
