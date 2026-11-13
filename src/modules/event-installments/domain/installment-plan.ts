/**
 * DOMAIN LAYER — Event installment plans.
 *
 * Pure. No database, no Nest, no HTTP. A plan is a reusable template; every
 * agreement snapshots the terms it needs at assignment time so editing a plan
 * never changes an existing agreement.
 */

export type InstallmentFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";
export type InitialPaymentType = "FIXED" | "PERCENT";
export type LateFeeType = "FIXED" | "PERCENT";

export interface EventInstallmentPlan {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly frequency: InstallmentFrequency;
  readonly intervalCount: number;
  readonly installmentCount: number;
  readonly initialPaymentType: InitialPaymentType;
  /** FIXED: minor units. PERCENT: basis points of the total amount (10000 = 100%). */
  readonly initialPaymentValue: bigint;
  /** Simple interest on the financed principal for the whole term, in basis points. */
  readonly interestRateBps: number;
  readonly lateFeeType: LateFeeType;
  /** FIXED: minor units. PERCENT: basis points of the schedule amount due. */
  readonly lateFeeValue: bigint;
  readonly gracePeriodDays: number;
  readonly allowPartialPayment: boolean;
  readonly allowEarlyPayment: boolean;
  readonly currency: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const MAX_INSTALLMENT_COUNT = 120;
export const MAX_INTERVAL_COUNT = 52;
export const MAX_INTEREST_RATE_BPS = 10_000;
export const MAX_INITIAL_PAYMENT_BPS = 10_000;
export const MAX_LATE_FEE_BPS = 10_000;

export function initialPaymentFor(
  plan: Pick<
    EventInstallmentPlan,
    "initialPaymentType" | "initialPaymentValue"
  >,
  totalAmountMinor: bigint,
): bigint {
  if (totalAmountMinor <= 0n) return 0n;
  if (plan.initialPaymentType === "FIXED") {
    return plan.initialPaymentValue > totalAmountMinor
      ? totalAmountMinor
      : plan.initialPaymentValue;
  }
  const bps = plan.initialPaymentValue;
  if (bps <= 0n) return 0n;
  const capped = bps > BigInt(MAX_INITIAL_PAYMENT_BPS)
    ? BigInt(MAX_INITIAL_PAYMENT_BPS)
    : bps;
  return (totalAmountMinor * capped) / 10_000n;
}

export function computeLateFeeAmount(
  lateFee: { feeType: LateFeeType; value: bigint },
  amountDueMinor: bigint,
): bigint {
  if (amountDueMinor <= 0n) return 0n;
  if (lateFee.feeType === "FIXED") return lateFee.value;
  if (lateFee.value <= 0n) return 0n;
  const capped = lateFee.value > BigInt(MAX_LATE_FEE_BPS)
    ? BigInt(MAX_LATE_FEE_BPS)
    : lateFee.value;
  return (amountDueMinor * capped) / 10_000n;
}

export interface PlanValidationInput {
  name: string;
  intervalCount: number;
  installmentCount: number;
  interestRateBps: number;
  initialPaymentValue: bigint;
  lateFeeValue: bigint;
  gracePeriodDays: number;
  currency: string;
}

export function validatePlanTerms(input: PlanValidationInput): void {
  if (input.name.trim().length === 0) {
    throw new Error("Plan name is required");
  }
  if (
    !Number.isInteger(input.intervalCount) ||
    input.intervalCount < 1 ||
    input.intervalCount > MAX_INTERVAL_COUNT
  ) {
    throw new Error(
      `interval_count must be between 1 and ${MAX_INTERVAL_COUNT}`,
    );
  }
  if (
    !Number.isInteger(input.installmentCount) ||
    input.installmentCount < 1 ||
    input.installmentCount > MAX_INSTALLMENT_COUNT
  ) {
    throw new Error(
      `installment_count must be between 1 and ${MAX_INSTALLMENT_COUNT}`,
    );
  }
  if (
    !Number.isInteger(input.interestRateBps) ||
    input.interestRateBps < 0 ||
    input.interestRateBps > MAX_INTEREST_RATE_BPS
  ) {
    throw new Error(
      `interest_rate_bps must be between 0 and ${MAX_INTEREST_RATE_BPS}`,
    );
  }
  if (input.initialPaymentValue < 0n || input.lateFeeValue < 0n) {
    throw new Error("Payment and fee values must not be negative");
  }
  if (
    !Number.isInteger(input.gracePeriodDays) ||
    input.gracePeriodDays < 0 ||
    input.gracePeriodDays > 90
  ) {
    throw new Error("grace_period_days must be between 0 and 90");
  }
  if (input.currency.trim().toUpperCase() !== "RWF") {
    throw new Error("Only RWF installment plans are supported");
  }
}
