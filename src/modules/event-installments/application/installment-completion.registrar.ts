import { Injectable, OnModuleInit } from "@nestjs/common";

import { PaymentCompletionRegistry } from "../../payments/index.js";

import { InstallmentPaymentsService } from "./installment-payments.service.js";

/**
 * Registers the EVENT_INSTALLMENT completion handler with the payments
 * module's registry once the event-installments module is ready. The
 * payments module never imports this module — the dependency points one
 * way, so no circular imports are possible.
 */
@Injectable()
export class InstallmentCompletionRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: PaymentCompletionRegistry,
    private readonly payments: InstallmentPaymentsService,
  ) {}

  onModuleInit(): void {
    this.registry.register("EVENT_INSTALLMENT", {
      onPaymentSucceeded: async (context) => {
        await this.payments.handlePaymentSucceeded({
          paymentIntentId: context.payment.id,
          referenceId: context.payment.referenceId,
          providerTransactionId: context.payment.providerTransactionId,
          paidAt: context.payment.paidAt,
          now: context.now,
        });
      },
    });
  }
}
