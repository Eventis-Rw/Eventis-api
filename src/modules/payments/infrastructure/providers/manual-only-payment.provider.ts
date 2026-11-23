import { Injectable } from "@nestjs/common";

import { AppError } from "../../../../common/errors/app-error.js";

import type {
  PaymentProvider,
  ProviderPaymentResult,
} from "./payment-provider.js";

@Injectable()
export class ManualOnlyPaymentProvider implements PaymentProvider {
  readonly name = "manual";
  requestPayment(): Promise<ProviderPaymentResult> {
    return Promise.reject(
      AppError.forbidden(
        "Automatic payment collection is disabled. Submit a receipt through Manual Payments.",
      ),
    );
  }
  getStatus(): Promise<ProviderPaymentResult> {
    return Promise.reject(
      AppError.forbidden(
        "Automatic payment collection is disabled. Track your manual payment submission instead.",
      ),
    );
  }
  verifyWebhook(): boolean {
    return false;
  }
}
