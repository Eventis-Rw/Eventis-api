/**
 * DOMAIN LAYER — event installment agreements and schedules.
 *
 * Pure status and balance rules. An agreement snapshots the plan terms at
 * assignment; schedules are fixed rows; balances are recomputed from schedule
 * rows, never incremented blindly.
 */

import { outstandingFor } from "./installment-calculation.js";

export type AgreementStatus =
  | "DRAFT"
  | "ACTIVE"
  | "COMPLETED"
  | "OVERDUE"
  | "CANCELLED"
  | "SUSPENDED";

export type ScheduleStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "WAIVED"
  | "CANCELLED";

export interface EventInstallmentSchedule {
  readonly id: string;
  readonly agreementId: string;
  readonly installmentNumber: number;
  readonly isInitialPayment: boolean;
  readonly dueDate: Date;
  readonly principalAmountMinor: bigint;
  readonly interestAmountMinor: bigint;
  readonly lateFeeAmountMinor: bigint;
  readonly amountDueMinor: bigint;
  readonly amountPaidMinor: bigint;
  readonly refundedAmountMinor: bigint;
  readonly outstandingAmountMinor: bigint;
  readonly status: ScheduleStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EventInstallmentAgreement {
  readonly id: string;
  readonly customerId: string;
  readonly eventId: string;
  readonly planId: string | null;
  readonly totalAmountMinor: bigint;
  readonly initialPaymentMinor: bigint;
  readonly interestAmountMinor: bigint;
  readonly totalPayableMinor: bigint;
  readonly amountPaidMinor: bigint;
  readonly refundedAmountMinor: bigint;
  readonly lateFeesTotalMinor: bigint;
  readonly outstandingBalanceMinor: bigint;
  readonly currency: string;
  readonly frequency: string;
  readonly intervalCount: number;
  readonly installmentCount: number;
  readonly gracePeriodDays: number;
  readonly lateFeeType: "FIXED" | "PERCENT";
  readonly lateFeeValue: bigint;
  readonly allowPartialPayment: boolean;
  readonly allowEarlyPayment: boolean;
  readonly startDate: Date;
  readonly status: AgreementStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const AGREEMENT_TRANSITIONS: Readonly<Record<AgreementStatus, AgreementStatus[]>> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["OVERDUE", "SUSPENDED", "CANCELLED", "COMPLETED"],
  OVERDUE: ["ACTIVE", "SUSPENDED", "CANCELLED", "COMPLETED"],
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionAgreement(
  from: AgreementStatus,
  to: AgreementStatus,
): boolean {
  if (from === to) return true;
  return AGREEMENT_TRANSITIONS[from].includes(to);
}

export function isTerminalAgreementStatus(status: AgreementStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

/** Schedules a customer is allowed to pay against. */
export function isPayableSchedule(status: ScheduleStatus): boolean {
  return (
    status === "PENDING" ||
    status === "PARTIALLY_PAID" ||
    status === "OVERDUE"
  );
}

/** Schedules that still count towards the outstanding balance. */
export function countsTowardsOutstanding(status: ScheduleStatus): boolean {
  return status !== "WAIVED" && status !== "CANCELLED";
}

export function scheduleStatusForOutstanding(
  outstandingAmountMinor: bigint,
  wasPayable: boolean,
): ScheduleStatus {
  if (outstandingAmountMinor <= 0n) return "PAID";
  if (wasPayable) return "PARTIALLY_PAID";
  // A refund reopened a paid schedule that still holds most of its amount.
  return "PARTIALLY_PAID";
}

export function agreementStatusForSchedules(
  schedules: Array<Pick<EventInstallmentSchedule, "status">>,
  current: AgreementStatus,
): AgreementStatus {
  if (isTerminalAgreementStatus(current)) return current;

  const open = schedules.filter(
    (schedule) => schedule.status !== "WAIVED" && schedule.status !== "CANCELLED",
  );
  if (open.length === 0) return "COMPLETED";
  const allPaid = open.every((schedule) => schedule.status === "PAID");
  if (allPaid) return "COMPLETED";
  if (current === "SUSPENDED") return "SUSPENDED";
  const anyOverdue = open.some((schedule) => schedule.status === "OVERDUE");
  if (anyOverdue) return "OVERDUE";
  return "ACTIVE";
}

export interface AgreementBalances {
  readonly amountPaidMinor: bigint;
  readonly refundedAmountMinor: bigint;
  readonly lateFeesTotalMinor: bigint;
  readonly outstandingBalanceMinor: bigint;
}

export function recomputeAgreementBalances(
  schedules: Array<
    Pick<
      EventInstallmentSchedule,
      | "status"
      | "amountDueMinor"
      | "amountPaidMinor"
      | "refundedAmountMinor"
      | "lateFeeAmountMinor"
    >
  >,
): AgreementBalances {
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

  return {
    amountPaidMinor,
    refundedAmountMinor,
    lateFeesTotalMinor,
    outstandingBalanceMinor,
  };
}

/** A due date is overdue once past due date + grace period. */
export function isScheduleOverdue(
  schedule: Pick<EventInstallmentSchedule, "dueDate">,
  gracePeriodDays: number,
  now: Date,
): boolean {
  const graceMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  return schedule.dueDate.getTime() + graceMs < now.getTime();
}

/**
 * Early payment: paying a schedule before an earlier payable schedule has
 * been settled. Guarded by the agreement's allowEarlyPayment flag.
 */
export function isEarlySchedule(
  schedules: Array<
    Pick<EventInstallmentSchedule, "id" | "installmentNumber" | "status">
  >,
  targetScheduleId: string,
): boolean {
  const target = schedules.find(
    (schedule) => schedule.id === targetScheduleId,
  );
  if (!target) return false;
  const earlier = schedules.filter(
    (schedule) =>
      schedule.installmentNumber < target.installmentNumber &&
      isPayableSchedule(schedule.status),
  );
  return earlier.length > 0;
}
