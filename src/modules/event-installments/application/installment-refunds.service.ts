import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";


import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import type {
  EventInstallmentRefund,
  RefundStatus,
} from "../domain/installment-payment.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

export interface CreateRefundInput {
  readonly installmentPaymentId: string;
  readonly amountMinor: bigint;
  readonly reason: string;
}

export interface CompleteRefundInput {
  readonly refundId: string;
  readonly processedBy: string;
  readonly providerRefundReference: string | null;
}

/**
 * Refunds for event installment payments.
 *
 * The payment aggregator exposes no refund API — money returns to the
 * customer through the aggregator's own console or an in-store cash
 * reconciliation. This workflow therefore never pretends a provider call
 * happened: REQUESTED → COMPLETED is the admin confirming that money has
 * actually been returned out-of-band, with the provider refund reference
 * recorded for audit.
 */
@Injectable()
export class InstallmentRefundsService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly clock: Clock,
  ) {}

  async request(
    actor: { userId: string },
    input: CreateRefundInput,
  ): Promise<EventInstallmentRefund> {
    const payment = await this.installments.findInstallmentPaymentById(
      input.installmentPaymentId,
    );
    if (!payment) throw AppError.notFound("Payment");
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Only succeeded payments can be refunded (this one is ${payment.status})`,
      );
    }
    if (input.reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A refund reason of at least 3 characters is required"],
      });
    }
    const refundable = payment.amountMinor - payment.refundedAmountMinor;
    if (input.amountMinor <= 0n) {
      throw AppError.validation({
        amount_minor: ["amount_minor must be positive"],
      });
    }
    if (input.amountMinor > refundable) {
      throw AppError.validation({
        amount_minor: [
          `amount_minor cannot exceed the refundable ${refundable.toString(10)}`,
        ],
      });
    }

    const refund = await this.installments.createRefund({
      installmentPaymentId: payment.id,
      amountMinor: input.amountMinor,
      reason: input.reason,
    });
    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "refund.requested",
      entityType: "EventInstallmentRefund",
      entityId: refund.id,
      previousValues: null,
      newValues: {
        payment_id: payment.id,
        amount_minor: input.amountMinor.toString(10),
      },
      reason: input.reason,
    });
    return refund;
  }

  /** Marks the out-of-band refund as done and moves the money back on paper. */
  async complete(
    input: CompleteRefundInput,
  ): Promise<EventInstallmentRefund> {
    const refund = await this.getRefund(input.refundId);
    if (refund.status !== "REQUESTED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `This refund was already ${refund.status.toLowerCase()}`,
      );
    }
    if (
      !input.providerRefundReference ||
      input.providerRefundReference.trim().length < 3
    ) {
      throw AppError.validation({
        provider_refund_reference: [
          "The refund reference from the payment provider is required to complete a refund",
        ],
      });
    }

    const result = await this.installments.completeRefund({
      refundId: refund.id,
      processedBy: input.processedBy,
      providerRefundReference: input.providerRefundReference.trim(),
      now: this.clock.now(),
    });
    if (!result.completed || !result.refund) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This refund was processed concurrently. Reload and try again.",
      );
    }
    return result.refund;
  }

  async reject(
    actor: { userId: string },
    refundId: string,
    rejectionReason: string,
  ): Promise<EventInstallmentRefund> {
    const refund = await this.getRefund(refundId);
    if (refund.status !== "REQUESTED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `This refund was already ${refund.status.toLowerCase()}`,
      );
    }
    if (rejectionReason.trim().length < 3) {
      throw AppError.validation({
        rejection_reason: [
          "A rejection reason of at least 3 characters is required",
        ],
      });
    }

    const result = await this.installments.rejectRefund({
      refundId: refund.id,
      processedBy: actor.userId,
      rejectionReason: rejectionReason.trim(),
      now: this.clock.now(),
    });
    if (!result.rejected || !result.refund) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This refund was processed concurrently. Reload and try again.",
      );
    }
    return result.refund;
  }

  async list(input: {
    page: number;
    limit: number;
    statuses?: RefundStatus[] | undefined;
  }): Promise<{ items: EventInstallmentRefund[]; total: number }> {
    return this.installments.listRefunds(input);
  }

  async get(id: string): Promise<EventInstallmentRefund> {
    return this.getRefund(id);
  }

  private async getRefund(id: string): Promise<EventInstallmentRefund> {
    const refund = await this.installments.findRefundById(id);
    if (!refund) throw AppError.notFound("Refund");
    return refund;
  }
}

