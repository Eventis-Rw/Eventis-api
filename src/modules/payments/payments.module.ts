import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { ENV, type Env } from "../../config/env.js";
import { IdentityModule } from "../identity/index.js";
import { PlatformModule } from "../platform/index.js";

import { FindLoveAccountController } from "./api/account-subscription.controller.js";
import {
  AdminInstallmentsController,
  InstallmentsController,
} from "./api/installments.controller.js";
import {
  AdminPaymentsController,
  PaymentsController,
} from "./api/payments.controller.js";
import { AccountSubscriptionService } from "./application/account-subscription.service.js";
import { InstallmentPlansService } from "./application/installment-plans.service.js";
import { PaymentActivationService } from "./application/payment-activation.service.js";
import { PaymentWebhookService } from "./application/payment-webhook.service.js";
import { PaymentsService } from "./application/payments.service.js";
import { PaymentRepository } from "./infrastructure/payment.repository.js";
import { AggregatorPaymentProvider } from "./infrastructure/providers/aggregator-payment.provider.js";
import { FakePaymentProvider } from "./infrastructure/providers/fake-payment.provider.js";
import {
  PAYMENT_GATEWAY,
  type PaymentProvider,
} from "./infrastructure/providers/payment-provider.js";

@Module({
  imports: [ConfigModule, PlatformModule, IdentityModule],
  controllers: [
    InstallmentsController,
    AdminInstallmentsController,
    PaymentsController,
    AdminPaymentsController,
    FindLoveAccountController,
  ],
  providers: [
    PaymentRepository,
    InstallmentPlansService,
    PaymentsService,
    PaymentActivationService,
    PaymentWebhookService,
    AccountSubscriptionService,
    FakePaymentProvider,
    AggregatorPaymentProvider,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV, FakePaymentProvider, AggregatorPaymentProvider],
      useFactory: (
        env: Env,
        fake: FakePaymentProvider,
        aggregator: AggregatorPaymentProvider,
      ): PaymentProvider =>
        env.PAYMENT_PROVIDER === "aggregator" ? aggregator : fake,
    },
  ],
})
export class PaymentsModule {}
