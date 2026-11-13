import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../../identity/index.js";
import {
  isTerminalPaymentStatus,
  paymentInstruction,
  PAYMENT_EXPIRY_MINUTES,
  PAYMENT_REUSE_WINDOW_MINUTES,
  phoneMatchesPaymentMethod,
  providerStatusToPaymentStatus,
  type PaymentIntentWithPlan,
  type PaymentMethod,
  type PaymentPurposeCode,
} from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";
import {
  PAYMENT_GATEWAY,
  type PaymentProvider,
} from "../infrastructure/providers/payment-provider.js";

import { PaymentCompletionRegistry } from "./payment-completion.registry.js";

export interface InitiateCollectionInput {
  readonly userId: string;
  readonly purpose: PaymentPurposeCode;
  /** Business identifier of what is being paid for (e.g. an installment payment id). */
  readonly referenceId: string | null;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly paymentMethod: PaymentMethod;
  readonly phoneNumber: string;
}

export interface CollectionResult {
  readonly payment: PaymentIntentWithPlan;
  readonly message: string;
}

/**
 * Purpose-generic mobile money collection, used by business modules such as
 * event installments. This is the same machinery FindLove payments use —
 * provider selection, idempotency, expiry, status reconciliation and webhook
 * processing — minus the FindLove-specific plan validation and response shape.
 *
 * Callers never talk to the payment provider directly.
 */
@Injectable()
export class PaymentCollectionsService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly completions: PaymentCompletionRegistry,
    private readonly clock: Clock,
    @Inject(PAYMENT_GATEWAY) private readonly provider: PaymentProvider,
  ) {}

  async initiate(
    input: InitiateCollectionInput,
    idempotencyKey: string | undefined,
  ): Promise<CollectionResult> {
    const now = this.clock.now();
    const key = normalizeIdempotencyKey(idempotencyKey);
    const phoneNumber = normalizePhone(input.phoneNumber);

    if (!phoneMatchesPaymentMethod(phoneNumber, input.paymentMethod)) {
      throw AppError.validation({
        payment_method: [
          "Use mtn_momo for 078/079 numbers or airtel_money for 072/073 numbers",
        ],
      });
    }
    if (input.currency !== "RWF" || input.amountMinor <= 0n) {
      throw AppError.validation({
        amount_minor: ["Amount must be positive and in RWF"],
      });
    }

    if (key) {
      const existing = await this.payments.findPaymentByIdempotencyKey(
        input.userId,
        key,
      );
      if (existing) {
        assertSameRequest(existing, input);
        return {
          payment: existing,
          message: messageForStatus(existing),
        };
      }
    } else if (input.referenceId) {
      const existing = await this.payments.findReusablePendingCollection({
        userId: input.userId,
        purpose: input.purpose,
        referenceId: input.referenceId,
        paymentMethod: input.paymentMethod,
        since: new Date(
          now.getTime() - PAYMENT_REUSE_WINDOW_MINUTES * 60 * 1000,
        ),
        now,
      });
      if (existing) {
        return {
          payment: existing,
          message: messageForStatus(existing),
        };
      }
    }

    const reference = await this.payments.nextPaymentReference();
    let payment: PaymentIntentWithPlan;
    try {
      payment = await this.payments.createCollectionIntent({
        reference,
        userId: input.userId,
        purpose: input.purpose,
        referenceId: input.referenceId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        phoneNumber,
        provider: this.provider.name,
        idempotencyKey: key,
        expiresAt: new Date(now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
      });
    } catch (error) {
      if (key && isUniqueConstraintError(error)) {
        const existing = await this.payments.findPaymentByIdempotencyKey(
          input.userId,
          key,
        );
        if (existing) {
          assertSameRequest(existing, input);
          return { payment: existing, message: messageForStatus(existing) };
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
      await this.completions.dispatchSucceeded(updated, now);
      updated = (await this.payments.findPaymentById(payment.id)) ?? updated;
      return {
        payment: updated,
        message: providerResult.message ?? "Payment completed.",
      };
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

    return {
      payment: updated,
      message:
        providerResult.message ?? paymentInstruction(payment.paymentMethod),
    };
  }

  /**
   * Reconciles a payment with its provider and returns the fresh intent.
   * Success is dispatched to the purpose completion handler; expiry and
   * failure statuses are applied exactly like the FindLove status endpoint.
   */
  async checkStatus(
    userId: string,
    identifier: string,
  ): Promise<PaymentIntentWithPlan> {
    const payment = await this.payments.findPaymentByIdentifier(identifier);
    if (!payment || payment.userId !== userId) {
      throw AppError.notFound("Payment");
    }
    if (isTerminalPaymentStatus(payment.status)) {
      return payment;
    }

    const now = this.clock.now();
    let result;
    try {
      result = await this.provider.getStatus({
        reference: payment.reference,
        providerTransactionId: payment.providerTransactionId,
      });
    } catch {
      return payment;
    }

    if (result.status === "SUCCEEDED") {
      const updated = await this.payments.updatePaymentIntent(payment.id, {
        status: "PROVIDER_REQUESTED",
        providerTransactionId:
          result.providerTransactionId ?? payment.providerTransactionId,
      });
      await this.completions.dispatchSucceeded(updated, now);
      return (
        (await this.payments.findPaymentById(payment.id)) ?? updated
      );
    }

    const providerStatus = providerStatusToPaymentStatus(result.status);
    const status =
      now.getTime() >= payment.expiresAt.getTime() &&
      (providerStatus === "AWAITING_USER" || providerStatus === "UNKNOWN")
        ? "EXPIRED"
        : providerStatus;
    return this.payments.updatePaymentIntent(payment.id, {
      status,
      providerTransactionId:
        result.providerTransactionId ?? payment.providerTransactionId,
      failureReason:
        status === "FAILED" || status === "CANCELLED"
          ? (result.message ?? "The payment provider rejected the payment.")
          : null,
    });
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
  existing: PaymentIntentWithPlan,
  input: InitiateCollectionInput,
): void {
  if (
    existing.purpose !== input.purpose ||
    existing.referenceId !== input.referenceId ||
    existing.amountMinor !== input.amountMinor ||
    existing.currency !== input.currency ||
    existing.paymentMethod !== input.paymentMethod ||
    existing.phoneNumber !== input.phoneNumber
  ) {
    throw AppError.conflict(
      ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      "This idempotency key was already used for a different payment request",
    );
  }
}

function messageForStatus(payment: PaymentIntentWithPlan): string {
  if (payment.status === "SUCCEEDED") {
    return "This payment has already been completed.";
  }
  if (payment.status === "UNKNOWN") {
    return "The payment status is unknown. Check the status before trying again.";
  }
  if (
    payment.status === "CREATED" ||
    payment.status === "PROVIDER_REQUESTED" ||
    payment.status === "AWAITING_USER" ||
    payment.status === "RECONCILING"
  ) {
    return "A payment is already in progress. Check its status before trying again.";
  }
  return "This payment did not complete. Start a new payment to try again.";
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
