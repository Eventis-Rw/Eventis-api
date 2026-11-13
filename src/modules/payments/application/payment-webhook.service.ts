import { Inject, Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { isTerminalPaymentStatus } from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";
import {
  PAYMENT_GATEWAY,
  type PaymentProvider,
} from "../infrastructure/providers/payment-provider.js";

import { PaymentCompletionRegistry } from "./payment-completion.registry.js";

export interface PaymentWebhookInput {
  providerEventId: string;
  eventType: string;
  paymentReference: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "unknown";
  amountMinor?: bigint | undefined;
  currency?: "RWF" | undefined;
  providerTransactionId?: string | undefined;
  message?: string | undefined;
  rawBody: Buffer;
  signature: string | undefined;
  payload: Record<string, unknown>;
}

export interface PaymentWebhookResult {
  received: true;
  duplicate: boolean;
}

@Injectable()
export class PaymentWebhookService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly completions: PaymentCompletionRegistry,
    private readonly clock: Clock,
    @Inject(PAYMENT_GATEWAY) private readonly provider: PaymentProvider,
  ) {}

  async process(input: PaymentWebhookInput): Promise<PaymentWebhookResult> {
    if (
      !this.provider.verifyWebhook({
        rawBody: input.rawBody,
        signature: input.signature,
      })
    ) {
      throw AppError.unauthenticated("Invalid payment webhook signature");
    }

    const payment = await this.payments.findPaymentByIdentifier(
      input.paymentReference,
    );
    if (!payment) throw AppError.notFound("Payment");

    const { event, duplicate } = await this.payments.recordWebhookEvent({
      provider: this.provider.name,
      providerEventId: input.providerEventId,
      paymentIntentId: payment.id,
      eventType: input.eventType,
      payload: input.payload,
    });
    if (duplicate && event.processedAt !== null) {
      return { received: true, duplicate: true };
    }

    try {
      if (
        input.amountMinor !== undefined &&
        input.amountMinor !== payment.amountMinor
      ) {
        throw AppError.validation({
          amount_minor: ["Webhook amount does not match the payment amount"],
        });
      }
      if (input.currency !== undefined && input.currency !== payment.currency) {
        throw AppError.validation({
          currency: ["Webhook currency does not match the payment currency"],
        });
      }

      const now = this.clock.now();
      if (input.status === "succeeded") {
        const updated = await this.payments.updatePaymentIntent(payment.id, {
          status: "PROVIDER_REQUESTED",
          providerTransactionId:
            input.providerTransactionId ?? payment.providerTransactionId,
        });
        await this.completions.dispatchSucceeded(updated, now);
      } else if (
        payment.status !== "SUCCEEDED" &&
        !(
          isTerminalPaymentStatus(payment.status) &&
          (input.status === "pending" || input.status === "unknown")
        )
      ) {
        const status =
          input.status === "pending"
            ? "AWAITING_USER"
            : input.status === "failed"
              ? "FAILED"
              : input.status === "cancelled"
                ? "CANCELLED"
                : "UNKNOWN";
        await this.payments.updatePaymentIntent(payment.id, {
          status,
          providerTransactionId:
            input.providerTransactionId ?? payment.providerTransactionId,
          failureReason:
            status === "FAILED" || status === "CANCELLED"
              ? (input.message ?? "The payment provider rejected the payment.")
              : null,
        });
      }

      await this.payments.markWebhookEventProcessed(event.id, {
        paymentIntentId: payment.id,
        processedAt: now,
      });
      return { received: true, duplicate: false };
    } catch (error) {
      await this.payments.markWebhookEventProcessed(event.id, {
        paymentIntentId: payment.id,
        processedAt: null,
        error: safeErrorMessage(error),
      });
      throw error;
    }
  }
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Payment webhook processing failed";
  return message.slice(0, 500);
}
