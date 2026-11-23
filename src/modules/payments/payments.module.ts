import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { ENV, type Env } from "../../config/env.js";
import { EmailModule } from "../../infrastructure/email/email.module.js";
import { IdentityModule } from "../identity/index.js";
import { OrganisationsModule } from "../organisations/index.js";
import { PlatformModule } from "../platform/index.js";

import { FindLoveAccountController } from "./api/account-subscription.controller.js";
import {
  AdminInstallmentsController,
  InstallmentsController,
} from "./api/installments.controller.js";
import { AdminManualPaymentMethodsController } from "./api/manual-payment-methods.controller.js";
import {
  AdminManualPaymentsController,
  ManualPaymentsController,
} from "./api/manual-payments.controller.js";
import {
  AdminPaymentsController,
  PaymentsController,
} from "./api/payments.controller.js";
import { AccountSubscriptionService } from "./application/account-subscription.service.js";
import { InstallmentPlansService } from "./application/installment-plans.service.js";
import { ManualPaymentMethodsService } from "./application/manual-payment-methods.service.js";
import { ManualPaymentsService } from "./application/manual-payments.service.js";
import { PaymentActivationService } from "./application/payment-activation.service.js";
import { PaymentCollectionsService } from "./application/payment-collections.service.js";
import {
  PaymentCompletionHandler,
  PaymentCompletionRegistry,
} from "./application/payment-completion.registry.js";
import { PaymentWebhookService } from "./application/payment-webhook.service.js";
import { PaymentsService } from "./application/payments.service.js";
import { ManualPaymentRepository } from "./infrastructure/manual-payment.repository.js";
import { PaymentRepository } from "./infrastructure/payment.repository.js";
import { AggregatorPaymentProvider } from "./infrastructure/providers/aggregator-payment.provider.js";
import { FakePaymentProvider } from "./infrastructure/providers/fake-payment.provider.js";
import { ManualOnlyPaymentProvider } from "./infrastructure/providers/manual-only-payment.provider.js";
import {
  PAYMENT_GATEWAY,
  type PaymentProvider,
} from "./infrastructure/providers/payment-provider.js";

const FINDLOVE_COMPLETION_HANDLER = Symbol("FINDLOVE_COMPLETION_HANDLER");

@Module({
  imports: [
    ConfigModule,
    PlatformModule,
    IdentityModule,
    OrganisationsModule,
    EmailModule,
  ],
  controllers: [
    InstallmentsController,
    AdminInstallmentsController,
    PaymentsController,
    AdminPaymentsController,
    FindLoveAccountController,
    ManualPaymentsController,
    AdminManualPaymentsController,
    AdminManualPaymentMethodsController,
  ],
  providers: [
    PaymentRepository,
    PaymentActivationService,
    PaymentCompletionRegistry,
    PaymentCollectionsService,
    InstallmentPlansService,
    PaymentsService,
    PaymentWebhookService,
    AccountSubscriptionService,
    ManualPaymentRepository,
    ManualPaymentMethodsService,
    ManualPaymentsService,
    FakePaymentProvider,
    ManualOnlyPaymentProvider,
    AggregatorPaymentProvider,
    {
      provide: FINDLOVE_COMPLETION_HANDLER,
      inject: [PaymentCompletionRegistry, PaymentActivationService],
      useFactory: (
        registry: PaymentCompletionRegistry,
        activation: PaymentActivationService,
      ): PaymentCompletionRegistry => {
        registry.register("FINDLOVE", {
          onPaymentSucceeded: async (ctx) => {
            if (!ctx.payment.plan) {
              throw new Error(
                `FINDLOVE payment ${ctx.payment.reference} has no installment plan`,
              );
            }
            await activation.activate(ctx.payment, ctx.payment.plan, ctx.now);
          },
        } satisfies PaymentCompletionHandler);
        return registry;
      },
    },
    {
      provide: PAYMENT_GATEWAY,
      inject: [
        ENV,
        FakePaymentProvider,
        AggregatorPaymentProvider,
        ManualOnlyPaymentProvider,
      ],
      useFactory: (
        env: Env,
        fake: FakePaymentProvider,
        aggregator: AggregatorPaymentProvider,
        manual: ManualOnlyPaymentProvider,
      ): PaymentProvider =>
        env.PAYMENT_PROVIDER === "manual"
          ? manual
          : env.PAYMENT_PROVIDER === "aggregator"
            ? aggregator
            : fake,
    },
  ],
  exports: [PaymentCompletionRegistry, PaymentCollectionsService],
})
export class PaymentsModule {}
