import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../../identity/index.js";
import {
  fromApiAccountType,
  fromApiPaymentMethod,
  isTerminalPaymentStatus,
  paymentInstruction,
  PAYMENT_EXPIRY_MINUTES,
  PAYMENT_REUSE_WINDOW_MINUTES,
  phoneMatchesPaymentMethod,
  providerStatusToPaymentStatus,
  toPublicPaymentStatus,
  type PaymentIntent,
  type PaymentIntentWithPlan,
  type PaymentMethod,
  type PaymentStatus,
  type PublicPaymentStatus,
} from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";
import {
  PAYMENT_GATEWAY,
  type PaymentProvider,
} from "../infrastructure/providers/payment-provider.js";
import {
  toAdminPaymentResponse,
  toInitiatePaymentResponse,
  toPaymentResponse,
  type AdminPaymentResponse,
  type InitiatePaymentResponse,
  type PaymentResponse,
} from "../mappers/payment.mapper.js";

import { PaymentActivationService } from "./payment-activation.service.js";

export interface InitiatePaymentInput {
  accountType: "private" | "public";
  installmentId: string;
  paymentMethod: "mtn_momo" | "airtel_money";
  phoneNumber: string;
}

export interface ListPaymentsInput {
  page: number;
  limit: number;
  status?: PublicPaymentStatus | undefined;
  accountType?: "private" | "public" | undefined;
  paymentMethod?: "mtn_momo" | "airtel_money" | undefined;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly activation: PaymentActivationService,
    private readonly clock: Clock,
    @Inject(PAYMENT_GATEWAY) private readonly provider: PaymentProvider,
  ) {}

  async initiate(
    userId: string,
    input: InitiatePaymentInput,
    idempotencyKey: string | undefined,
  ): Promise<InitiatePaymentResponse> {
    const now = this.clock.now();
    const key = normalizeIdempotencyKey(idempotencyKey);
    const phoneNumber = normalizePhone(input.phoneNumber);
    const paymentMethod = fromApiPaymentMethod(input.paymentMethod);
    const accountType = fromApiAccountType(input.accountType);

    if (!phoneMatchesPaymentMethod(phoneNumber, paymentMethod)) {
      throw AppError.validation({
        payment_method: [
          "Use mtn_momo for 078/079 numbers or airtel_money for 072/073 numbers",
        ],
      });
    }

    const plan = await this.payments.findInstallmentPlanById(
      input.installmentId,
    );
    if (!plan) throw AppError.notFound("Installment plan");
    if (!plan.isActive) {
      throw AppError.validation({
        installment_id: ["This installment plan is not available"],
      });
    }
    if (plan.accountType !== accountType) {
      throw AppError.validation({
        installment_id: [
          "This installment plan belongs to a different account type",
        ],
      });
    }
    if (plan.currency !== "RWF" || plan.priceMinor <= 0n) {
      throw AppError.validation({
        installment_id: [
          "This installment plan cannot be paid with mobile money",
        ],
      });
    }

    if (key) {
      const existing = await this.payments.findPaymentByIdempotencyKey(
        userId,
        key,
      );
      if (existing) {
        assertSameRequest(existing, {
          accountType,
          installmentPlanId: plan.id,
          paymentMethod,
          phoneNumber,
        });
        return toInitiatePaymentResponse(existing, messageForStatus(existing));
      }
    } else {
      const existing = await this.payments.findReusablePendingPayment({
        userId,
        installmentPlanId: plan.id,
        paymentMethod,
        since: new Date(
          now.getTime() - PAYMENT_REUSE_WINDOW_MINUTES * 60 * 1000,
        ),
        now,
      });
      if (existing) {
        return toInitiatePaymentResponse(existing, messageForStatus(existing));
      }
    }

    const reference = await this.payments.nextPaymentReference();
    let payment: PaymentIntentWithPlan;
    try {
      payment = await this.payments.createPaymentIntent({
        reference,
        userId,
        installmentPlanId: plan.id,
        accountType: plan.accountType,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        paymentMethod,
        phoneNumber,
        provider: this.provider.name,
        idempotencyKey: key,
        expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
      });
    } catch (error) {
      if (key && isUniqueConstraintError(error)) {
        const existing = await this.payments.findPaymentByIdempotencyKey(
          userId,
          key,
        );
        if (existing) {
          assertSameRequest(existing, {
            accountType,
            installmentPlanId: plan.id,
            paymentMethod,
            phoneNumber,
          });
          return toInitiatePaymentResponse(
            existing,
            messageForStatus(existing),
          );
        }
      }
      throw error;
    }

    let providerResult;
    try {
      providerResult = await this.provider.requestPayment({
        reference: payment.reference,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        phoneNumber: payment.phoneNumber,
      });
    } catch (error) {
      await this.payments.updatePaymentIntent(payment.id, {
        status: "UNKNOWN",
        failureReason:
          "The provider request did not return a confirmed status. Check status before retrying.",
      });
      throw new AppError(
        ERROR_CODES.PAYMENT_PROVIDER_UNAVAILABLE,
        "The payment provider is unavailable. Check the payment status before trying again.",
        502,
        { cause: error },
      );
    }

    if (providerResult.status === "SUCCEEDED") {
      let updated = await this.payments.updatePaymentIntent(payment.id, {
        status: "PROVIDER_REQUESTED",
        providerTransactionId: providerResult.providerTransactionId,
        providerRequestedAt: now,
      });
      await this.activation.activate(updated, plan, now);
      updated = (await this.payments.findPaymentById(payment.id)) ?? updated;
      return toInitiatePaymentResponse(
        updated,
        providerResult.message ?? "Payment completed.",
      );
    }

    const status = providerStatusToPaymentStatus(providerResult.status);
    const updated = await this.payments.updatePaymentIntent(payment.id, {
      status,
      providerTransactionId: providerResult.providerTransactionId,
      providerRequestedAt: now,
      failureReason:
        status === "FAILED" || status === "CANCELLED"
          ? (providerResult.message ??
            "The payment provider rejected the payment.")
          : null,
    });

    return toInitiatePaymentResponse(
      updated,
      providerResult.message ?? paymentInstruction(payment.paymentMethod),
    );
  }

  async status(userId: string, identifier: string): Promise<PaymentResponse> {
    const payment = await this.payments.findPaymentByIdentifier(identifier);
    if (!payment || payment.userId !== userId) {
      throw AppError.notFound("Payment");
    }
    if (isTerminalPaymentStatus(payment.status)) {
      return toPaymentResponse(payment);
    }

    const now = this.clock.now();
    let result;
    try {
      result = await this.provider.getStatus({
        reference: payment.reference,
        providerTransactionId: payment.providerTransactionId,
      });
    } catch {
      return toPaymentResponse(payment);
    }

    if (result.status === "SUCCEEDED") {
      let updated = await this.payments.updatePaymentIntent(payment.id, {
        status: "PROVIDER_REQUESTED",
        providerTransactionId:
          result.providerTransactionId ?? payment.providerTransactionId,
      });
      await this.activation.activate(updated, payment.plan, now);
      updated = (await this.payments.findPaymentById(payment.id)) ?? updated;
      return toPaymentResponse(updated);
    }

    const providerStatus = providerStatusToPaymentStatus(result.status);
    const status =
      now.getTime() >= payment.expiresAt.getTime() &&
      (providerStatus === "AWAITING_USER" || providerStatus === "UNKNOWN")
        ? "EXPIRED"
        : providerStatus;
    const updated = await this.payments.updatePaymentIntent(payment.id, {
      status,
      providerTransactionId:
        result.providerTransactionId ?? payment.providerTransactionId,
      failureReason:
        status === "FAILED" || status === "CANCELLED"
          ? (result.message ?? "The payment provider rejected the payment.")
          : null,
    });
    return toPaymentResponse(updated);
  }

  async listAdmin(input: ListPaymentsInput): Promise<{
    items: AdminPaymentResponse[];
    page: number;
    limit: number;
    total: number;
  }> {
    const result = await this.payments.listPayments({
      page: input.page,
      limit: input.limit,
      statuses: input.status ? statusesForFilter(input.status) : undefined,
      accountType: input.accountType
        ? fromApiAccountType(input.accountType)
        : undefined,
      paymentMethod: input.paymentMethod
        ? fromApiPaymentMethod(input.paymentMethod)
        : undefined,
    });
    return {
      items: result.items.map(toAdminPaymentResponse),
      page: input.page,
      limit: input.limit,
      total: result.total,
    };
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | null {
  if (value === undefined) return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 120) {
    throw AppError.validation({
      idempotency_key: [
        "idempotency-key header must be between 8 and 120 characters",
      ],
    });
  }
  return key;
}

function normalizePhone(value: string): string {
  try {
    return normalizeRwandaPhone(value);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      throw AppError.validation({
        phone_number: ["Enter a valid Rwanda mobile number"],
      });
    }
    throw error;
  }
}

function assertSameRequest(
  existing: PaymentIntent,
  input: {
    accountType: PaymentIntent["accountType"];
    installmentPlanId: string;
    paymentMethod: PaymentMethod;
    phoneNumber: string;
  },
): void {
  if (
    existing.accountType !== input.accountType ||
    existing.installmentPlanId !== input.installmentPlanId ||
    existing.paymentMethod !== input.paymentMethod ||
    existing.phoneNumber !== input.phoneNumber
  ) {
    throw AppError.conflict(
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      "This idempotency key was already used for a different payment request",
    );
  }
}

function messageForStatus(payment: PaymentIntent): string {
  const status = toPublicPaymentStatus(payment.status);
  if (status === "succeeded") return "This payment has already been completed.";
  if (status === "unknown") {
    return "The payment status is unknown. Check the status before trying again.";
  }
  if (status === "pending") {
    return "A payment for this installment is already in progress. Check its status before trying again.";
  }
  return "This payment did not complete. Start a new payment to try again.";
}

function statusesForFilter(status: PublicPaymentStatus): PaymentStatus[] {
  if (status === "succeeded") return ["SUCCEEDED"];
  if (status === "failed") return ["FAILED"];
  if (status === "cancelled") return ["CANCELLED"];
  if (status === "expired") return ["EXPIRED"];
  if (status === "unknown") return ["UNKNOWN"];
  return ["CREATED", "PROVIDER_REQUESTED", "AWAITING_USER", "RECONCILING"];
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
