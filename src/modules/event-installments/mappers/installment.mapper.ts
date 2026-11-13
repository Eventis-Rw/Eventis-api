import { toWire } from "@eventis/contracts";

import type { PaymentIntentWithPlan } from "../../payments/index.js";
import type {
  EventInstallmentAgreement,
  EventInstallmentSchedule,
} from "../domain/installment-agreement.js";
import type {
  EventInstallmentLateFee,
  EventInstallmentPayment,
  EventInstallmentRefund,
  InstallmentCustomerSummary,
} from "../domain/installment-payment.js";
import type { EventInstallmentPlan } from "../domain/installment-plan.js";

export type WireStatus = string;

export interface InstallmentPlanWire {
  id: string;
  name: string;
  description: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  interval_count: number;
  installment_count: number;
  initial_payment_type: "fixed" | "percent";
  initial_payment_value: string;
  interest_rate_bps: number;
  late_fee_type: "fixed" | "percent";
  late_fee_value: string;
  grace_period_days: number;
  allow_partial_payment: boolean;
  allow_early_payment: boolean;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstallmentAgreementWire {
  id: string;
  customer_id: string;
  event_id: string;
  plan_id: string | null;
  total_amount_minor: string;
  initial_payment_minor: string;
  interest_amount_minor: string;
  total_payable_minor: string;
  amount_paid_minor: string;
  refunded_amount_minor: string;
  late_fees_total_minor: string;
  outstanding_balance_minor: string;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  interval_count: number;
  installment_count: number;
  grace_period_days: number;
  late_fee_type: "fixed" | "percent";
  late_fee_value: string;
  allow_partial_payment: boolean;
  allow_early_payment: boolean;
  start_date: string;
  status: WireStatus;
  created_at: string;
  updated_at: string;
}

export interface InstallmentScheduleWire {
  id: string;
  agreement_id: string;
  installment_number: number;
  is_initial_payment: boolean;
  due_date: string;
  principal_amount_minor: string;
  interest_amount_minor: string;
  late_fee_amount_minor: string;
  amount_due_minor: string;
  amount_paid_minor: string;
  refunded_amount_minor: string;
  outstanding_amount_minor: string;
  status: WireStatus;
  created_at: string;
  updated_at: string;
}

export interface InstallmentPaymentWire {
  id: string;
  agreement_id: string;
  schedule_id: string;
  customer_id: string;
  payment_intent_id: string | null;
  source: "provider" | "manual";
  amount_minor: string;
  refunded_amount_minor: string;
  currency: string;
  payment_method: "mtn_momo" | "airtel_money" | null;
  transaction_reference: string | null;
  status: WireStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallmentRefundWire {
  id: string;
  installment_payment_id: string;
  amount_minor: string;
  reason: string;
  status: WireStatus;
  provider_refund_reference: string | null;
  rejection_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  payment: {
    id: string;
    amount_minor: string;
    status: WireStatus;
    agreement_id: string;
    schedule_id: string;
  };
}

export interface InstallmentLateFeeWire {
  id: string;
  agreement_id: string;
  schedule_id: string;
  fee_type: "fixed" | "percent";
  amount_minor: string;
  reason: string;
  status: WireStatus;
  applied_at: string;
  waived_at: string | null;
  created_at: string;
}

export interface InstallmentNotificationWire {
  id: string;
  customer_id: string;
  agreement_id: string | null;
  schedule_id: string | null;
  notification_type: Lowercase<string>;
  channels: string[];
  status: WireStatus;
  sent_at: string | null;
  created_at: string;
  customer?: CustomerWire;
}

export interface CustomerWire {
  id: string;
  phone: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

export function toInstallmentPlanWire(
  plan: EventInstallmentPlan,
): InstallmentPlanWire {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    frequency: plan.frequency.toLowerCase() as "weekly" | "monthly" | "yearly",
    interval_count: plan.intervalCount,
    installment_count: plan.installmentCount,
    initial_payment_type: plan.initialPaymentType.toLowerCase() as "fixed" | "percent",
    initial_payment_value: toWire(plan.initialPaymentValue),
    interest_rate_bps: plan.interestRateBps,
    late_fee_type: plan.lateFeeType.toLowerCase() as "fixed" | "percent",
    late_fee_value: toWire(plan.lateFeeValue),
    grace_period_days: plan.gracePeriodDays,
    allow_partial_payment: plan.allowPartialPayment,
    allow_early_payment: plan.allowEarlyPayment,
    currency: plan.currency,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    updated_at: plan.updatedAt.toISOString(),
  };
}

export function toInstallmentAgreementWire(
  agreement: EventInstallmentAgreement,
): InstallmentAgreementWire {
  return {
    id: agreement.id,
    customer_id: agreement.customerId,
    event_id: agreement.eventId,
    plan_id: agreement.planId,
    total_amount_minor: toWire(agreement.totalAmountMinor),
    initial_payment_minor: toWire(agreement.initialPaymentMinor),
    interest_amount_minor: toWire(agreement.interestAmountMinor),
    total_payable_minor: toWire(agreement.totalPayableMinor),
    amount_paid_minor: toWire(agreement.amountPaidMinor),
    refunded_amount_minor: toWire(agreement.refundedAmountMinor),
    late_fees_total_minor: toWire(agreement.lateFeesTotalMinor),
    outstanding_balance_minor: toWire(agreement.outstandingBalanceMinor),
    currency: agreement.currency,
    frequency: agreement.frequency.toLowerCase() as "weekly" | "monthly" | "yearly",
    interval_count: agreement.intervalCount,
    installment_count: agreement.installmentCount,
    grace_period_days: agreement.gracePeriodDays,
    late_fee_type: agreement.lateFeeType.toLowerCase() as "fixed" | "percent",
    late_fee_value: toWire(agreement.lateFeeValue),
    allow_partial_payment: agreement.allowPartialPayment,
    allow_early_payment: agreement.allowEarlyPayment,
    start_date: agreement.startDate.toISOString(),
    status: agreement.status.toLowerCase(),
    created_at: agreement.createdAt.toISOString(),
    updated_at: agreement.updatedAt.toISOString(),
  };
}

export function toInstallmentScheduleWire(
  schedule: EventInstallmentSchedule,
): InstallmentScheduleWire {
  return {
    id: schedule.id,
    agreement_id: schedule.agreementId,
    installment_number: schedule.installmentNumber,
    is_initial_payment: schedule.isInitialPayment,
    due_date: schedule.dueDate.toISOString(),
    principal_amount_minor: toWire(schedule.principalAmountMinor),
    interest_amount_minor: toWire(schedule.interestAmountMinor),
    late_fee_amount_minor: toWire(schedule.lateFeeAmountMinor),
    amount_due_minor: toWire(schedule.amountDueMinor),
    amount_paid_minor: toWire(schedule.amountPaidMinor),
    refunded_amount_minor: toWire(schedule.refundedAmountMinor),
    outstanding_amount_minor: toWire(schedule.outstandingAmountMinor),
    status: schedule.status.toLowerCase(),
    created_at: schedule.createdAt.toISOString(),
    updated_at: schedule.updatedAt.toISOString(),
  };
}

export function toInstallmentPaymentWire(
  payment: EventInstallmentPayment,
): InstallmentPaymentWire {
  return {
    id: payment.id,
    agreement_id: payment.agreementId,
    schedule_id: payment.scheduleId,
    customer_id: payment.customerId,
    payment_intent_id: payment.paymentIntentId,
    source: payment.source.toLowerCase() as "provider" | "manual",
    amount_minor: toWire(payment.amountMinor),
    refunded_amount_minor: toWire(payment.refundedAmountMinor),
    currency: payment.currency,
    payment_method: payment.paymentMethod
      ? (payment.paymentMethod.toLowerCase() as "mtn_momo" | "airtel_money")
      : null,
    transaction_reference: payment.transactionReference,
    status: payment.status.toLowerCase(),
    paid_at: payment.paidAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
    updated_at: payment.updatedAt.toISOString(),
  };
}

export function toInstallmentRefundWire(
  refund: EventInstallmentRefund,
): InstallmentRefundWire {
  return {
    id: refund.id,
    installment_payment_id: refund.installmentPaymentId,
    amount_minor: toWire(refund.amountMinor),
    reason: refund.reason,
    status: refund.status.toLowerCase(),
    provider_refund_reference: refund.providerRefundReference,
    rejection_reason: refund.rejectionReason,
    processed_by: refund.processedBy,
    processed_at: refund.processedAt?.toISOString() ?? null,
    created_at: refund.createdAt.toISOString(),
    payment: {
      id: refund.payment.id,
      amount_minor: toWire(refund.payment.amountMinor),
      status: refund.payment.status.toLowerCase(),
      agreement_id: refund.payment.agreementId,
      schedule_id: refund.payment.scheduleId,
    },
  };
}

export function toInstallmentLateFeeWire(
  lateFee: EventInstallmentLateFee,
): InstallmentLateFeeWire {
  return {
    id: lateFee.id,
    agreement_id: lateFee.agreementId,
    schedule_id: lateFee.scheduleId,
    fee_type: lateFee.feeType.toLowerCase() as "fixed" | "percent",
    amount_minor: toWire(lateFee.amountMinor),
    reason: lateFee.reason,
    status: lateFee.status.toLowerCase(),
    applied_at: lateFee.appliedAt.toISOString(),
    waived_at: lateFee.waivedAt?.toISOString() ?? null,
    created_at: lateFee.createdAt.toISOString(),
  };
}

export function toCustomerWire(customer: InstallmentCustomerSummary): CustomerWire {
  return {
    id: customer.id,
    phone: customer.phone,
    display_name: customer.displayName,
    first_name: customer.firstName,
    last_name: customer.lastName,
  };
}

/** Public payment intent projection reused from the payments module. */
export function toPaymentIntentWire(payment: PaymentIntentWithPlan) {
  return {
    id: payment.id,
    reference: payment.reference,
    status: payment.status.toLowerCase(),
    amount_minor: toWire(payment.amountMinor),
    currency: payment.currency,
    payment_method: payment.paymentMethod.toLowerCase(),
    phone_number: payment.phoneNumber,
    provider_transaction_id: payment.providerTransactionId,
    failure_reason: payment.failureReason,
    expires_at: payment.expiresAt.toISOString(),
    paid_at: payment.paidAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
  };
}

export function fromWireMoney(value: string): bigint {
  return BigInt(value);
}
