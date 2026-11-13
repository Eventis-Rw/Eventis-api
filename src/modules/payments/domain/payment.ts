export type PaymentPurposeCode =
  | "FINDLOVE"
  | "ORGANISER_PLAN"
  | "PROMOTION"
  | "EVENT_INSTALLMENT";
export type FindLoveAccountType = "PRIVATE" | "PUBLIC";
export type InstallmentInterval = "WEEKLY" | "MONTHLY" | "YEARLY";
export type PaymentMethod = "MTN_MOMO" | "AIRTEL_MONEY";
export type PaymentStatus =
  | "CREATED"
  | "PROVIDER_REQUESTED"
  | "AWAITING_USER"
  | "UNKNOWN"
  | "RECONCILING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";
export type ProviderPaymentStatus =
  "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN";
export type PublicPaymentStatus =
  "pending" | "succeeded" | "failed" | "cancelled" | "expired" | "unknown";

export interface InstallmentPlan {
  readonly id: string;
  readonly accountType: FindLoveAccountType;
  readonly interval: InstallmentInterval;
  readonly durationDays: number;
  readonly priceMinor: bigint;
  readonly currency: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentIntent {
  readonly id: string;
  readonly reference: string;
  readonly userId: string;
  readonly purpose: PaymentPurposeCode;
  readonly referenceId: string | null;
  readonly installmentPlanId: string | null;
  readonly accountType: FindLoveAccountType | null;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly paymentMethod: PaymentMethod;
  readonly phoneNumber: string;
  readonly status: PaymentStatus;
  readonly provider: string;
  readonly providerTransactionId: string | null;
  readonly failureReason: string | null;
  readonly idempotencyKey: string | null;
  readonly expiresAt: Date;
  readonly providerRequestedAt: Date | null;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentIntentWithPlan extends PaymentIntent {
  /**
   * The FindLove installment plan backing this intent. Null for any purpose
   * other than FINDLOVE — event installments and future purposes carry their
   * own business linkage through `purpose` + `referenceId`.
   */
  readonly plan: InstallmentPlan | null;
}

export interface AdminPaymentIntent extends Omit<
  PaymentIntentWithPlan,
  "plan"
> {
  readonly plan: InstallmentPlan | null;
  readonly user: {
    readonly id: string;
    readonly phone: string;
    readonly displayName: string | null;
    readonly firstName: string | null;
    readonly lastName: string | null;
  };
}

export interface ServiceSubscription {
  readonly id: string;
  readonly userId: string;
  readonly service: "FINDLOVE" | "EVENTIS";
  readonly accountType: FindLoveAccountType | null;
  readonly installmentPlanId: string | null;
  readonly paymentIntentId: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface ActiveSubscription extends ServiceSubscription {
  readonly plan: InstallmentPlan | null;
  readonly payment: PaymentIntent | null;
}

export const FINDLOVE_SERVICE = "FINDLOVE" as const;
export const DEFAULT_CURRENCY = "RWF" as const;
export const PAYMENT_EXPIRY_MINUTES = 10;
export const PAYMENT_REUSE_WINDOW_MINUTES = 15;

export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
];

export const PENDING_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "CREATED",
  "PROVIDER_REQUESTED",
  "AWAITING_USER",
  "UNKNOWN",
  "RECONCILING",
];

const TERMINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

const PENDING_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "CREATED",
  "PROVIDER_REQUESTED",
  "AWAITING_USER",
  "UNKNOWN",
  "RECONCILING",
]);

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return PENDING_STATUSES.has(status);
}

export function toPublicPaymentStatus(
  status: PaymentStatus,
): PublicPaymentStatus {
  if (status === "SUCCEEDED") return "succeeded";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "EXPIRED") return "expired";
  if (status === "UNKNOWN") return "unknown";
  return "pending";
}

export function providerStatusToPaymentStatus(
  status: ProviderPaymentStatus,
): PaymentStatus {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "UNKNOWN") return "UNKNOWN";
  return "AWAITING_USER";
}

export function paymentMethodForPhone(phone: string): PaymentMethod | null {
  const prefix = phone.startsWith("+250")
    ? phone.slice(4, 6)
    : phone.slice(0, 2);
  if (prefix === "78" || prefix === "79") return "MTN_MOMO";
  if (prefix === "72" || prefix === "73") return "AIRTEL_MONEY";
  return null;
}

export function phoneMatchesPaymentMethod(
  phone: string,
  method: PaymentMethod,
): boolean {
  return paymentMethodForPhone(phone) === method;
}

export function defaultDurationDays(interval: InstallmentInterval): number {
  if (interval === "WEEKLY") return 7;
  if (interval === "MONTHLY") return 30;
  return 365;
}

export function subscriptionExpiry(
  now: Date,
  durationDays: number,
  currentExpiresAt: Date | null,
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt.getTime()
      : now.getTime();
  return new Date(base + durationDays * 24 * 60 * 60 * 1000);
}

export function daysRemaining(expiresAt: Date, now: Date): number {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export function toApiAccountType(
  value: FindLoveAccountType,
): "private" | "public" {
  return value === "PRIVATE" ? "private" : "public";
}

export function fromApiAccountType(
  value: "private" | "public",
): FindLoveAccountType {
  return value === "private" ? "PRIVATE" : "PUBLIC";
}

export function toApiPaymentMethod(
  value: PaymentMethod,
): "mtn_momo" | "airtel_money" {
  return value === "MTN_MOMO" ? "mtn_momo" : "airtel_money";
}

export function fromApiPaymentMethod(
  value: "mtn_momo" | "airtel_money",
): PaymentMethod {
  return value === "mtn_momo" ? "MTN_MOMO" : "AIRTEL_MONEY";
}

export function toApiInterval(
  value: InstallmentInterval,
): "weekly" | "monthly" | "yearly" {
  if (value === "WEEKLY") return "weekly";
  if (value === "MONTHLY") return "monthly";
  return "yearly";
}

export function fromApiInterval(
  value: "weekly" | "monthly" | "yearly",
): InstallmentInterval {
  if (value === "weekly") return "WEEKLY";
  if (value === "monthly") return "MONTHLY";
  return "YEARLY";
}

export function paymentInstruction(method: PaymentMethod): string {
  return method === "MTN_MOMO"
    ? "Please approve the MTN Mobile Money payment on your phone."
    : "Please approve the Airtel Money payment on your phone.";
}
