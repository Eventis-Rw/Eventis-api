/**
 * DOMAIN LAYER — the installment calculation engine.
 *
 * Pure integer math on bigint minor units. No floating point anywhere: money
 * crosses this engine only as bigint, and every division floors, with the
 * remainder absorbed by the last installment so the generated schedule always
 * reconciles exactly with the agreed payable amount.
 *
 * Admin-compatible rounding policy:
 * Interest rounds half up to the nearest minor unit using integer arithmetic.
 * Remaining minor units are distributed to the earliest installments, matching
 * the existing admin preview. With no deposit the first installment is due on
 * the start date; with a deposit the regular schedule starts one interval later.
 */

import type { InstallmentFrequency } from "./installment-plan.js";

export interface AgreementTermsInput {
  readonly totalAmountMinor: bigint;
  readonly initialPaymentMinor: bigint;
  readonly interestRateBps: number;
  readonly installmentCount: number;
  readonly frequency: InstallmentFrequency;
  readonly intervalCount: number;
  readonly startDate: Date;
}

export interface AgreementTerms {
  readonly totalAmountMinor: bigint;
  readonly initialPaymentMinor: bigint;
  readonly financedAmountMinor: bigint;
  readonly interestAmountMinor: bigint;
  readonly totalPayableMinor: bigint;
}

export interface ScheduledInstallment {
  readonly installmentNumber: number;
  readonly isInitialPayment: boolean;
  readonly dueDate: Date;
  readonly principalAmountMinor: bigint;
  readonly interestAmountMinor: bigint;
  readonly amountDueMinor: bigint;
}

export function computeAgreementTerms(
  input: AgreementTermsInput,
): AgreementTerms {
  if (input.totalAmountMinor <= 0n) {
    throw new Error("total_amount_minor must be positive");
  }
  if (input.installmentCount < 1) {
    throw new Error("installment_count must be at least 1");
  }
  if (input.interestRateBps < 0) {
    throw new Error("interest_rate_bps must not be negative");
  }
  if (
    input.initialPaymentMinor < 0n ||
    input.initialPaymentMinor > input.totalAmountMinor
  ) {
    throw new Error(
      "initial_payment_minor must be between 0 and the total amount",
    );
  }

  const financedAmountMinor =
    input.totalAmountMinor - input.initialPaymentMinor;
  const interestAmountMinor =
    input.interestRateBps === 0
      ? 0n
      : (financedAmountMinor * BigInt(input.interestRateBps) + 5_000n) /
        10_000n;
  const totalPayableMinor = input.totalAmountMinor + interestAmountMinor;

  return {
    totalAmountMinor: input.totalAmountMinor,
    initialPaymentMinor: input.initialPaymentMinor,
    financedAmountMinor,
    interestAmountMinor,
    totalPayableMinor,
  };
}

export interface ScheduleAmountsInput {
  readonly totalAmountMinor: bigint;
  readonly initialPaymentMinor: bigint;
  readonly interestAmountMinor: bigint;
  readonly installmentCount: number;
  readonly frequency: InstallmentFrequency;
  readonly intervalCount: number;
  readonly startDate: Date;
}

export function generateScheduleFromAmounts(
  input: ScheduleAmountsInput,
): ScheduledInstallment[] {
  if (input.installmentCount < 1) {
    throw new Error("installment_count must be at least 1");
  }
  if (
    input.initialPaymentMinor < 0n ||
    input.initialPaymentMinor > input.totalAmountMinor
  ) {
    throw new Error(
      "initial_payment_minor must be between 0 and the total amount",
    );
  }

  const rows: ScheduledInstallment[] = [];
  if (input.initialPaymentMinor > 0n) {
    rows.push({
      installmentNumber: 1,
      isInitialPayment: true,
      dueDate: input.startDate,
      principalAmountMinor: input.initialPaymentMinor,
      interestAmountMinor: 0n,
      amountDueMinor: input.initialPaymentMinor,
    });
  }

  const offset = rows.length;
  const financedPayableMinor =
    input.totalAmountMinor -
    input.initialPaymentMinor +
    input.interestAmountMinor;
  const count = BigInt(input.installmentCount);

  const baseAmount = financedPayableMinor / count;
  const remainder = financedPayableMinor - baseAmount * count;
  const baseInterest = input.interestAmountMinor / count;
  const interestRemainder = input.interestAmountMinor - baseInterest * count;

  for (let i = 1; i <= input.installmentCount; i += 1) {
    const position = BigInt(i - 1);
    const amountDueMinor = baseAmount + (position < remainder ? 1n : 0n);
    const interestAmountMinor =
      baseInterest + (position < interestRemainder ? 1n : 0n);
    rows.push({
      installmentNumber: i + offset,
      isInitialPayment: false,
      dueDate: addIntervals(
        input.startDate,
        i - (offset === 0 ? 1 : 0),
        input.frequency,
        input.intervalCount,
      ),
      principalAmountMinor: amountDueMinor - interestAmountMinor,
      interestAmountMinor,
      amountDueMinor,
    });
  }

  return rows;
}

export function generateSchedule(
  input: AgreementTermsInput,
): ScheduledInstallment[] {
  const terms = computeAgreementTerms(input);
  return generateScheduleFromAmounts({
    totalAmountMinor: terms.totalAmountMinor,
    initialPaymentMinor: terms.initialPaymentMinor,
    interestAmountMinor: terms.interestAmountMinor,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    startDate: input.startDate,
  });
}

/** Days in a month, UTC. February honours leap years. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds `intervalCount` frequency units to `date`. Month arithmetic clamps to
 * the last day of the target month (Jan 31 + 1 month = Feb 28/29), which is
 * the least surprising rule for human-facing due dates.
 */
export function addIntervals(
  date: Date,
  amount: number,
  frequency: InstallmentFrequency,
  intervalCount: number,
): Date {
  if (intervalCount < 1) {
    throw new Error("interval_count must be at least 1");
  }
  const total = amount * intervalCount;
  if (frequency === "WEEKLY") {
    return new Date(date.getTime() + total * 7 * 24 * 60 * 60 * 1000);
  }
  if (frequency === "YEARLY") {
    const result = new Date(date.getTime());
    result.setUTCFullYear(result.getUTCFullYear() + total);
    // Feb 29 → Feb 28 in a non-leap target year.
    if (
      date.getUTCMonth() === 1 &&
      date.getUTCDate() === 29 &&
      result.getUTCMonth() === 2
    ) {
      result.setUTCDate(0);
    }
    return result;
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthIndex = month + total;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, normalizedMonth));
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** The net collected amount after refunds, never negative. */
export function netCollected(
  amountPaidMinor: bigint,
  refundedAmountMinor: bigint,
): bigint {
  const net = amountPaidMinor - refundedAmountMinor;
  return net < 0n ? 0n : net;
}

export function outstandingFor(
  amountDueMinor: bigint,
  amountPaidMinor: bigint,
  refundedAmountMinor: bigint,
): bigint {
  const outstanding =
    amountDueMinor - netCollected(amountPaidMinor, refundedAmountMinor);
  return outstanding < 0n ? 0n : outstanding;
}
