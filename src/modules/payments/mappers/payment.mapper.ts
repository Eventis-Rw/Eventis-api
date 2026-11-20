import { toWire } from "@eventis/contracts";

import {
  daysRemaining,
  toApiAccountType,
  toApiInterval,
  toApiPaymentMethod,
  toPublicPaymentStatus,
  type ActiveSubscription,
  type AdminPaymentIntent,
  type FindLoveAccountType,
  type InstallmentPlan,
  type PaymentIntent,
} from "../domain/payment.js";

export interface InstallmentPlanResponse {
  id: string;
  account_type: "private" | "public";
  interval: "weekly" | "monthly" | "yearly";
  duration_days: number;
  price_minor: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentResponse {
  payment_id: string;
  payment_status: ReturnType<typeof toPublicPaymentStatus>;
  payment_method: ReturnType<typeof toApiPaymentMethod>;
  amount_minor: string;
  currency: string;
  phone_number: string;
  account_type: "private" | "public";
  installment_id: string;
  provider_transaction_id: string | null;
  failure_reason: string | null;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiatePaymentResponse extends PaymentResponse {
  success: true;
  message: string;
}

export interface AdminPaymentResponse
  extends Omit<
    PaymentResponse,
    "account_type" | "installment_id" | "installment"
  > {
  id: string;
  account_type: "private" | "public" | null;
  installment_id: string | null;
  user: {
    id: string;
    phone: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  installment: InstallmentPlanResponse | null;
}

export interface AccountSubscriptionResponse {
  account_type: "private" | "public";
  has_active_subscription: boolean;
  subscription: {
    id: string;
    service: "FINDLOVE";
    account_type: "private" | "public";
    installment_id: string | null;
    payment_id: string | null;
    starts_at: string;
    expires_at: string;
    days_remaining: number;
    installment: InstallmentPlanResponse | null;
  } | null;
}

export function toInstallmentPlanResponse(
  plan: InstallmentPlan,
): InstallmentPlanResponse {
  return {
    id: plan.id,
    account_type: toApiAccountType(plan.accountType),
    interval: toApiInterval(plan.interval),
    duration_days: plan.durationDays,
    price_minor: toWire(plan.priceMinor),
    currency: plan.currency,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    updated_at: plan.updatedAt.toISOString(),
  };
}

function toPaymentBase(payment: PaymentIntent) {
  return {
    payment_id: payment.reference,
    payment_status: toPublicPaymentStatus(payment.status),
    payment_method: toApiPaymentMethod(payment.paymentMethod),
    amount_minor: toWire(payment.amountMinor),
    currency: payment.currency,
    phone_number: payment.phoneNumber,
    provider_transaction_id: payment.providerTransactionId,
    failure_reason: payment.failureReason,
    expires_at: payment.expiresAt.toISOString(),
    paid_at: payment.paidAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
    updated_at: payment.updatedAt.toISOString(),
  };
}

export function toPaymentResponse(payment: PaymentIntent): PaymentResponse {
  if (!payment.accountType || !payment.installmentPlanId) {
    throw new Error("FindLove payment is missing plan details");
  }
  return {
    ...toPaymentBase(payment),
    account_type: toApiAccountType(payment.accountType),
    installment_id: payment.installmentPlanId,
  };
}

export function toInitiatePaymentResponse(
  payment: PaymentIntent,
  message: string,
): InitiatePaymentResponse {
  return {
    success: true,
    message,
    ...toPaymentResponse(payment),
  };
}

export function toAdminPaymentResponse(
  payment: AdminPaymentIntent,
): AdminPaymentResponse {
  return {
    ...toPaymentBase(payment),
    id: payment.id,
    account_type: payment.accountType
      ? toApiAccountType(payment.accountType)
      : null,
    installment_id: payment.installmentPlanId,
    installment: payment.plan
      ? toInstallmentPlanResponse(payment.plan)
      : null,
    user: {
      id: payment.user.id,
      phone: payment.user.phone,
      display_name: payment.user.displayName,
      first_name: payment.user.firstName,
      last_name: payment.user.lastName,
    },
  };
}

export function toAccountSubscriptionResponse(
  accountType: FindLoveAccountType,
  active: ActiveSubscription | null,
  now: Date,
): AccountSubscriptionResponse {
  return {
    account_type: toApiAccountType(accountType),
    has_active_subscription: active !== null,
    subscription: active
      ? {
          id: active.id,
          service: "FINDLOVE",
          account_type: active.accountType
            ? toApiAccountType(active.accountType)
            : toApiAccountType(accountType),
          installment_id: active.installmentPlanId,
          payment_id: active.payment?.reference ?? null,
          starts_at: active.createdAt.toISOString(),
          expires_at: active.expiresAt.toISOString(),
          days_remaining: daysRemaining(active.expiresAt, now),
          installment: active.plan
            ? toInstallmentPlanResponse(active.plan)
            : null,
        }
      : null,
  };
}
