import { Injectable, Logger } from "@nestjs/common";

import type {
  PaymentIntentWithPlan,
  PaymentPurposeCode,
} from "../domain/payment.js";

/**
 * What happens after the payments module confirms, through the provider, that
 * money actually moved. Each purpose owns its own business follow-up:
 *
 * - FINDLOVE creates/extends a ServiceSubscription.
 * - EVENT_INSTALLMENT credits an event installment payment, schedule and
 *   agreement balance.
 *
 * The payments module itself only knows the registry, never the follow-ups, so
 * a new purpose never requires touching webhook or status reconciliation code.
 */
export interface PaymentCompletionContext {
  readonly payment: PaymentIntentWithPlan;
  readonly now: Date;
}

export interface PaymentCompletionHandler {
  onPaymentSucceeded(context: PaymentCompletionContext): Promise<void>;
}

@Injectable()
export class PaymentCompletionRegistry {
  private readonly logger = new Logger(PaymentCompletionRegistry.name);
  private readonly handlers = new Map<
    PaymentPurposeCode,
    PaymentCompletionHandler
  >();

  register(purpose: PaymentPurposeCode, handler: PaymentCompletionHandler): void {
    if (this.handlers.has(purpose)) {
      throw new Error(`A payment completion handler is already registered for ${purpose}`);
    }
    this.handlers.set(purpose, handler);
  }

  /**
   * Dispatches confirmed success to the owning purpose. A purpose without a
   * registered handler (e.g. ORGANISER_PLAN today) is logged and skipped —
   * the payment intent is still marked SUCCEEDED by the caller.
   */
  async dispatchSucceeded(
    payment: PaymentIntentWithPlan,
    now: Date,
  ): Promise<void> {
    const handler = this.handlers.get(payment.purpose);
    if (!handler) {
      this.logger.warn(
        `No payment completion handler for purpose ${payment.purpose} (payment ${payment.reference})`,
      );
      return;
    }
    await handler.onPaymentSucceeded({ payment, now });
  }
}
