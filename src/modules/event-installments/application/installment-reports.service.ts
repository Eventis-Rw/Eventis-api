import { Injectable } from "@nestjs/common";

import type { AgreementStatus } from "../domain/installment-agreement.js";
import type {
  EventInstallmentAuditLog,
  EventInstallmentPayment,
} from "../domain/installment-payment.js";
import {
  EventInstallmentRepository,
  type CustomerSummary,
} from "../infrastructure/installment.repository.js";

export interface InstallmentReportSummary {
  readonly totalAgreements: number;
  readonly byStatus: Record<AgreementStatus, number>;
  readonly totalExpectedMinor: bigint;
  readonly totalCollectedMinor: bigint;
  readonly totalRefundedMinor: bigint;
  readonly totalOutstandingMinor: bigint;
  readonly totalLateFeesMinor: bigint;
  readonly overdueBalanceMinor: bigint;
}

export interface UpcomingSchedule {
  readonly agreementId: string;
  readonly customerId: string;
  readonly scheduleId: string;
  readonly installmentNumber: number;
  readonly dueDate: Date;
  readonly amountDueMinor: bigint;
  readonly outstandingAmountMinor: bigint;
  readonly status: string;
}

@Injectable()
export class InstallmentReportsService {
  constructor(private readonly installments: EventInstallmentRepository) {}

  summary(input: {
    createdFrom?: Date | undefined;
    createdTo?: Date | undefined;
  }): Promise<InstallmentReportSummary> {
    return this.installments.reportSummary(input);
  }

  async recentPayments(input: {
    limit: number;
    customerId?: string | undefined;
    eventId?: string | undefined;
  }): Promise<EventInstallmentPayment[]> {
    return this.installments.reportRecentPayments(input);
  }

  async upcomingSchedules(input: {
    from: Date;
    to: Date;
    limit: number;
    customerId?: string | undefined;
  }): Promise<UpcomingSchedule[]> {
    const rows = await this.installments.reportUpcomingSchedules(input);
    return rows.map(({ schedule, agreement }) => ({
      agreementId: agreement.id,
      customerId: agreement.customerId,
      scheduleId: schedule.id,
      installmentNumber: schedule.installmentNumber,
      dueDate: schedule.dueDate,
      amountDueMinor: schedule.amountDueMinor,
      outstandingAmountMinor: schedule.outstandingAmountMinor,
      status: schedule.status,
    }));
  }

  async auditLogs(input: {
    page: number;
    limit: number;
    entityId?: string | undefined;
    entityType?: string | undefined;
    actorId?: string | undefined;
  }): Promise<{
    items: Array<EventInstallmentAuditLog & { actor: CustomerSummary | null }>;
    total: number;
  }> {
    return this.installments.listAuditLogs(input);
  }
}
