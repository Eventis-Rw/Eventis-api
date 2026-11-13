import { Injectable } from "@nestjs/common";

import type {
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRequestInput,
} from "./payment-provider.js";

@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";

  requestPayment(input: ProviderRequestInput): Promise<ProviderPaymentResult> {
    return Promise.resolve({
      status: "PENDING",
      providerTransactionId: `fake_${input.reference}`,
      message:
        input.paymentMethod === "MTN_MOMO"
          ? "Approve the MTN Mobile Money prompt on your phone."
          : "Approve the Airtel Money prompt on your phone.",
    });
  }

  getStatus(): Promise<ProviderPaymentResult> {
    return Promise.resolve({
      status: "PENDING",
      providerTransactionId: null,
      message: "Waiting for the provider webhook.",
    });
  }

  verifyWebhook(): boolean {
    return true;
  }
}
