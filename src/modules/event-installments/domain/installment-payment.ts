/**
 * DOMAIN LAYER — event installment payments, refunds, notifications, audit.
 *
 * Pure. One schedule can hold many payment attempts; only provider-confirmed
 * (or explicitly audited manual) successes count as collected money.
 */

export type InstallmentPaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type InstallmentPaymentSource = "PROVIDER" | "MANUAL";

export interface EventInstallmentPayment {
  readonly id: string;
  readonly agreementId: string;
  readonly scheduleId: string;
  readonly customerId: string;
  readonly paymentIntentId: string | null;
  readonly source: InstallmentPaymentSource;
  readonly amountMinor: bigint;
  readonly refundedAmountMinor: bigint;
  readonly currency: string;
  readonly paymentMethod: "MTN_MOMO" | "AIRTEL_MONEY" | null;
  readonly transactionReference: string | null;
  readonly status: InstallmentPaymentStatus;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Statuses a collection attempt may move to once money is confirmed. */
export const CONFIRMABLE_PAYMENT_STATUSES: readonly InstallmentPaymentStatus[] =
  ["PENDING", "FAILED", "CANCELLED"];

export function paymentStatusAfterRefund(
  amountMinor: bigint,
  refundedAmountMinor: bigint,
): InstallmentPaymentStatus {
  if (refundedAmountMinor >= amountMinor) return "REFUNDED";
  if (refundedAmountMinor > 0n) return "PARTIALLY_REFUNDED";
  return "SUCCEEDED";
}

export type RefundStatus = "REQUESTED" | "COMPLETED" | "REJECTED";

export interface EventInstallmentRefund {
  readonly id: string;
  readonly installmentPaymentId: string;
  readonly amountMinor: bigint;
  readonly reason: string;
  readonly status: RefundStatus;
  readonly providerRefundReference: string | null;
  readonly rejectionReason: string | null;
  readonly processedBy: string | null;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
  /** The payment this refund belongs to, for display and audit. */
  readonly payment: {
    readonly id: string;
    readonly amountMinor: bigint;
    readonly status: InstallmentPaymentStatus;
    readonly agreementId: string;
    readonly scheduleId: string;
  };
}

export type LateFeeStatus = "APPLIED" | "WAIVED";

export interface EventInstallmentLateFee {
  readonly id: string;
  readonly agreementId: string;
  readonly scheduleId: string;
  readonly feeType: "FIXED" | "PERCENT";
  readonly amountMinor: bigint;
  readonly reason: string;
  readonly status: LateFeeStatus;
  readonly appliedAt: Date;
  readonly waivedAt: Date | null;
  readonly waivedBy: string | null;
  readonly createdAt: Date;
}

export type InstallmentNotificationChannel = "SMS" | "EMAIL";

export type InstallmentNotificationStatus = "PENDING" | "SENT" | "FAILED";

export type InstallmentNotificationType =
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "UPCOMING_REMINDER"
  | "DUE_REMINDER"
  | "OVERDUE_NOTICE"
  | "LATE_FEE_APPLIED"
  | "REFUND_COMPLETED"
  | "AGREEMENT_COMPLETED";

export interface EventInstallmentNotification {
  readonly id: string;
  readonly customerId: string;
  readonly agreementId: string | null;
  readonly scheduleId: string | null;
  readonly notificationType: InstallmentNotificationType;
  readonly channels: InstallmentNotificationChannel[];
  readonly status: InstallmentNotificationStatus;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
}

export interface EventInstallmentAuditLog {
  readonly id: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly previousValues: Record<string, unknown> | null;
  readonly newValues: Record<string, unknown>;
  readonly reason: string | null;
  readonly createdAt: Date;
}

/** A projection of the user an installment belongs to, for display only. */
export interface InstallmentCustomerSummary {
  readonly id: string;
  readonly phone: string;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
}
