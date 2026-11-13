
import { ERROR_CODES } from "@eventis/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  PaymentCollectionsService,
  type InitiateCollectionInput,
  type PaymentIntentWithPlan,
  type PaymentCompletionHandler,
} from "../../payments/index.js";
import {
  isEarlySchedule,
  type EventInstallmentAgreement,
  type EventInstallmentSchedule,
} from "../domain/installment-agreement.js";
import { outstandingFor } from "../domain/installment-calculation.js";
import type { EventInstallmentPayment } from "../domain/installment-payment.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

const INSTALLMENT_REUSE_WINDOW_MINUTES = 15;

export interface InitiateInstallmentPaymentResult {
  readonly installmentPayment: EventInstallmentPayment;
  readonly paymentIntent: PaymentIntentWithPlan | null;
  readonly message: string;
}

@Injectable()
export class InstallmentPaymentsService {
  private readonly logger = new Logger(InstallmentPaymentsService.name);

  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly collections: PaymentCollectionsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Starts a mobile money collection for one schedule of the caller's
   * agreement. Creates the installment payment record first, then hands the
   * collection to the payments module — the provider is only ever touched
   * through PAYMENT_GATEWAY inside that module.
   */
  async initiate(
    input: {
      userId: string;
      agreementId: string;
      scheduleId: string;
      amountMinor: bigint;
      paymentMethod: "MTN_MOMO" | "AIRTEL_MONEY";
      phoneNumber: string;
    },
    idempotencyKey: string | undefined,
  ): Promise<InitiateInstallmentPaymentResult> {
    const now = this.clock.now();
    const { agreement, schedule } = await this.loadPayableSchedule(
      input.userId,
      input.agreementId,
      input.scheduleId,
    );
    const siblings = await this.installments.findSchedulesForAgreement(
      agreement.id,
    );

    const outstanding = outstandingFor(
      schedule.amountDueMinor,
      schedule.amountPaidMinor,
      schedule.refundedAmountMinor,
    );
    if (input.amountMinor <= 0n) {
      throw AppError.validation({
        amount_minor: ["amount_minor must be positive"],
      });
    }
    if (input.amountMinor > outstanding) {
      throw AppError.validation({
        amount_minor: [
          `amount_minor cannot exceed the outstanding ${outstanding.toString(10)}`,
        ],
      });
    }
    const isPartial = input.amountMinor < outstanding;
    if (isPartial && !agreement.allowPartialPayment) {
      throw AppError.validation({
        amount_minor: ["This agreement requires full installments"],
      });
    }
    const early = isEarlySchedule(siblings, schedule.id);
    if (early && !agreement.allowEarlyPayment) {
      throw AppError.validation({
        schedule_id: ["This installment is not yet due"],
      });
    }

    // Reuse an in-flight collection for the same schedule/method so a tapped
    // retry does not stack provider requests; reconcile it with the provider
    // before answering so the customer sees the truth, not a stale row.
    const pending = await this.installments.findPendingInstallmentPayment({
      scheduleId: schedule.id,
      paymentMethod: input.paymentMethod,
      since: new Date(
        now.getTime() - INSTALLMENT_REUSE_WINDOW_MINUTES * 60 * 1000,
      ),
    });
    if (pending?.paymentIntentId) {
      const intent = await this.collections.checkStatus(
        input.userId,
        pending.paymentIntentId,
      );
      const mirrored = await this.mirrorIntentStatus(pending, intent);
      return {
        installmentPayment: mirrored,
        paymentIntent: intent,
        message:
          intent.status === "SUCCEEDED"
            ? "Payment completed."
            : "A payment for this installment is already in progress. Check its status before trying again.",
      };
    }

    const installmentPayment = await this.installments.createInstallmentPayment({
      agreementId: agreement.id,
      scheduleId: schedule.id,
      customerId: agreement.customerId,
      source: "PROVIDER",
      amountMinor: input.amountMinor,
      currency: agreement.currency,
      paymentMethod: input.paymentMethod,
      transactionReference: null,
    });

    const collectionInput: InitiateCollectionInput = {
      userId: input.userId,
      purpose: "EVENT_INSTALLMENT",
      referenceId: installmentPayment.id,
      amountMinor: input.amountMinor,
      currency: agreement.currency,
      paymentMethod: input.paymentMethod,
      phoneNumber: input.phoneNumber,
    };

    // If initiation throws, the record stays PENDING without an intent
    // link; it is inert (excluded from balances) so leaving it keeps the
    // attempt visible to the customer.
    const collection = await this.collections.initiate(
      collectionInput,
      idempotencyKey,
    );
    const intent = collection.payment;

    await this.installments.linkPaymentIntent(
      installmentPayment.id,
      intent.id,
    );

    const fresh =
      (await this.installments.findInstallmentPaymentById(
        installmentPayment.id,
      )) ?? installmentPayment;
    if (intent.status === "SUCCEEDED") {
      const mirrored = await this.mirrorIntentStatus(fresh, intent);
      return {
        installmentPayment: mirrored,
        paymentIntent: intent,
        message: "Payment completed.",
      };
    }
    return {
      installmentPayment: fresh,
      paymentIntent: intent,
      message: paymentMessage(intent),
    };
  }

  /**
   * Customer-side status check: reconciles the underlying payment intent with
   * the provider through the payments module and mirrors terminal states
   * onto the installment payment record.
   */
  async checkStatus(
    userId: string,
    installmentPaymentId: string,
  ): Promise<{ installmentPayment: EventInstallmentPayment; message: string }> {
    const payment = await this.getOwned(userId, installmentPaymentId);
    if (!payment.paymentIntentId) {
      return {
        installmentPayment: payment,
        message:
          payment.source === "MANUAL"
            ? "This payment was recorded manually."
            : "This payment has not been sent to a provider yet.",
      };
    }

    const intent = await this.collections.checkStatus(
      userId,
      payment.paymentIntentId,
    );
    const next = await this.mirrorIntentStatus(payment, intent);
    return { installmentPayment: next, message: paymentMessage(intent) };
  }

  /**
   * Completion hook for the payments module: called once the provider has
   * confirmed that money moved for an EVENT_INSTALLMENT intent. Applies the
   * collection through compare-and-swap so webhook and poll confirmations
   * can never double-credit.
   */
  async handlePaymentSucceeded(input: {
    paymentIntentId: string;
    referenceId: string | null;
    providerTransactionId: string | null;
    paidAt: Date | null;
    now: Date;
  }): Promise<void> {
    const installmentPaymentId =
      input.referenceId ??
      (await this.installments.findInstallmentPaymentByIntent(
        input.paymentIntentId,
      ))?.id;
    if (!installmentPaymentId) {
      this.logger.warn(
        `EVENT_INSTALLMENT payment intent ${input.paymentIntentId} has no installment payment record`,
      );
      return;
    }
    const result = await this.installments.applyConfirmedCollection({
      installmentPaymentId,
      paidAt: input.paidAt ?? input.now,
      transactionReference: input.providerTransactionId,
      now: input.now,
    });
    if (!result.applied) {
      this.logger.log(
        `Installment payment ${installmentPaymentId} was already confirmed; skipped`,
      );
    }
  }

  /**
   * Admin records money received outside the platform (cash, bank transfer).
   * Requires a transaction reference and an audit reason; credits the
   * schedule immediately and reconciles the agreement.
   */
  async recordManualPayment(
    actor: { userId: string },
    input: {
      agreementId: string;
      scheduleId: string;
      amountMinor: bigint;
      transactionReference: string;
      reason: string;
    },
  ): Promise<EventInstallmentPayment> {
    const { agreement, schedule } = await this.loadPayableScheduleForAdmin(
      input.agreementId,
      input.scheduleId,
    );
    if (input.reason.trim().length < 3) {
      throw AppError.validation({
        reason: ["A reason of at least 3 characters is required"],
      });
    }
    if (input.transactionReference.trim().length < 3) {
      throw AppError.validation({
        transaction_reference: [
          "A transaction reference of at least 3 characters is required",
        ],
      });
    }
    const outstanding = outstandingFor(
      schedule.amountDueMinor,
      schedule.amountPaidMinor,
      schedule.refundedAmountMinor,
    );
    if (input.amountMinor <= 0n) {
      throw AppError.validation({
        amount_minor: ["amount_minor must be positive"],
      });
    }
    if (input.amountMinor > outstanding) {
      throw AppError.validation({
        amount_minor: [
          `amount_minor cannot exceed the outstanding ${outstanding.toString(10)}`,
        ],
      });
    }

    const payment = await this.installments.createInstallmentPayment({
      agreementId: agreement.id,
      scheduleId: schedule.id,
      customerId: agreement.customerId,
      source: "MANUAL",
      amountMinor: input.amountMinor,
      currency: agreement.currency,
      paymentMethod: null,
      transactionReference: input.transactionReference,
    });
    await this.installments.createAuditLog({
      actorId: actor.userId,
      action: "payment.manual_recorded",
      entityType: "EventInstallmentPayment",
      entityId: payment.id,
      previousValues: null,
      newValues: {
        amount_minor: input.amountMinor.toString(10),
        transaction_reference: input.transactionReference,
      },
      reason: input.reason,
    });

    const result = await this.installments.applyConfirmedCollection({
      installmentPaymentId: payment.id,
      paidAt: this.clock.now(),
      transactionReference: input.transactionReference,
      now: this.clock.now(),
    });
    if (!result.payment) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "The payment could not be applied. Reload the schedule and try again.",
      );
    }
    return result.payment;
  }

  async get(
    actor: { userId: string; role: string; roles: string[] },
    id: string,
  ): Promise<EventInstallmentPayment> {
    const payment = await this.installments.findInstallmentPaymentById(id);
    if (!payment) throw AppError.notFound("Payment");
    if (isAdminActor(actor)) return payment;
    if (payment.customerId === actor.userId) return payment;
    const agreement = await this.installments.findAgreementById(
      payment.agreementId,
    );
    const event = agreement
      ? await this.installments.findEventById(agreement.eventId)
      : null;
    if (event && event.posterId === actor.userId) return payment;
    throw AppError.forbidden("You do not have access to this payment");
  }

  async listForCustomer(
    userId: string,
    input: { agreementId?: string | undefined },
  ): Promise<EventInstallmentPayment[]> {
    const result = await this.installments.listInstallmentPayments({
      page: 1,
      limit: 100,
      customerId: userId,
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
    });
    return result.items;
  }

  async listAdmin(input: {
    page: number;
    limit: number;
    customerId?: string | undefined;
    agreementId?: string | undefined;
    eventId?: string | undefined;
    statuses?: EventInstallmentPayment["status"][] | undefined;
  }): Promise<{ items: EventInstallmentPayment[]; total: number }> {
    return this.installments.listInstallmentPayments(input);
  }

  /**
   * Maps provider-reconciled intent statuses onto the installment payment
   * record. Succeeded goes through the compare-and-swap credit; failure
   * states only ever mark the record — money was never collected, so no
   * balances move.
   */
  private async mirrorIntentStatus(
    payment: EventInstallmentPayment,
    intent: PaymentIntentWithPlan,
  ): Promise<EventInstallmentPayment> {
    const mirrored = intentToInstallmentStatus(intent.status);
    if (payment.status === mirrored) return payment;
    if (mirrored === "SUCCEEDED") {
      const confirmed = await this.installments.applyConfirmedCollection({
        installmentPaymentId: payment.id,
        paidAt: intent.paidAt ?? this.clock.now(),
        transactionReference: intent.providerTransactionId,
        now: this.clock.now(),
      });
      return confirmed.payment ?? payment;
    }
    await this.installments.setInstallmentPaymentStatus(payment.id, mirrored);
    return (
      (await this.installments.findInstallmentPaymentById(payment.id)) ??
      payment
    );
  }

  private async loadPayableSchedule(
    userId: string,
    agreementId: string,
    scheduleId: string,
  ): Promise<{
    agreement: EventInstallmentAgreement;
    schedule: EventInstallmentSchedule;
  }> {
    const found = await this.installments.findScheduleWithAgreement(scheduleId);
    if (!found || found.agreement.id !== agreementId) {
      throw AppError.notFound("Schedule");
    }
    const { agreement, schedule } = found;
    if (agreement.customerId !== userId) {
      throw AppError.forbidden("This agreement belongs to another customer");
    }
    assertAgreementPayable(agreement);
    assertSchedulePayable(schedule);
    return { agreement, schedule };
  }

  private async loadPayableScheduleForAdmin(
    agreementId: string,
    scheduleId: string,
  ): Promise<{
    agreement: EventInstallmentAgreement;
    schedule: EventInstallmentSchedule;
  }> {
    const found = await this.installments.findScheduleWithAgreement(scheduleId);
    if (!found || found.agreement.id !== agreementId) {
      throw AppError.notFound("Schedule");
    }
    assertAgreementPayable(found.agreement);
    assertSchedulePayable(found.schedule);
    return found;
  }

  private async getOwned(
    userId: string,
    installmentPaymentId: string,
  ): Promise<EventInstallmentPayment> {
    const payment =
      await this.installments.findInstallmentPaymentById(installmentPaymentId);
    if (!payment || payment.customerId !== userId) {
      throw AppError.notFound("Payment");
    }
    return payment;
  }
}

function assertAgreementPayable(agreement: EventInstallmentAgreement): void {
  if (agreement.status !== "ACTIVE") {
    throw AppError.conflict(
      ERROR_CODES.VALIDATION_FAILED,
      `This agreement is ${agreement.status}; only ACTIVE agreements accept payments`,
    );
  }
}

function assertSchedulePayable(schedule: EventInstallmentSchedule): void {
  if (schedule.status === "PAID") {
    throw AppError.conflict(
      ERROR_CODES.VALIDATION_FAILED,
      "This installment is already fully paid",
    );
  }
  if (schedule.status === "WAIVED" || schedule.status === "CANCELLED") {
    throw AppError.conflict(
      ERROR_CODES.VALIDATION_FAILED,
      `This installment is ${schedule.status} and cannot be paid`,
    );
  }
  if (
    outstandingFor(
      schedule.amountDueMinor,
      schedule.amountPaidMinor,
      schedule.refundedAmountMinor,
    ) <= 0n
  ) {
    throw AppError.conflict(
      ERROR_CODES.VALIDATION_FAILED,
      "This installment is already fully paid",
    );
  }
}

function intentToInstallmentStatus(
  status: PaymentIntentWithPlan["status"],
): "SUCCEEDED" | "FAILED" | "CANCELLED" | "PENDING" {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED" || status === "EXPIRED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

export function installmentCompletionHandler(
  service: InstallmentPaymentsService,
): PaymentCompletionHandler {
  return {
    async onPaymentSucceeded(context) {
      await service.handlePaymentSucceeded({
        paymentIntentId: context.payment.id,
        referenceId: context.payment.referenceId,
        providerTransactionId: context.payment.providerTransactionId,
        paidAt: context.payment.paidAt,
        now: context.now,
      });
    },
  };
}

function isAdminActor(actor: { userId: string; role: string; roles: string[] }) {
  return [actor.role, ...actor.roles].some(
    (role) => role.toUpperCase() === "ADMIN",
  );
}

function paymentMessage(intent: PaymentIntentWithPlan): string {
  const status = intent.status;
  if (status === "SUCCEEDED") return "Payment completed.";
  if (status === "FAILED") return "The payment failed.";
  if (status === "CANCELLED") return "The payment was cancelled.";
  if (status === "EXPIRED") return "The payment expired before completion.";
  if (status === "UNKNOWN") {
    return "The payment status is unknown. Check the status before trying again.";
  }
  return "The payment is awaiting confirmation on your phone.";
}
