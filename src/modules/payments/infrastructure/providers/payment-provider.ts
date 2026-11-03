import type {
  PaymentMethod,
  ProviderPaymentStatus,
} from "../../domain/payment.js";

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

export interface ProviderRequestInput {
  readonly reference: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly paymentMethod: PaymentMethod;
  readonly phoneNumber: string;
}

export interface ProviderPaymentResult {
  readonly status: ProviderPaymentStatus;
  readonly providerTransactionId: string | null;
  readonly message?: string;
}

export interface PaymentProvider {
  readonly name: string;
  requestPayment(input: ProviderRequestInput): Promise<ProviderPaymentResult>;
  getStatus(input: {
    reference: string;
    providerTransactionId: string | null;
  }): Promise<ProviderPaymentResult>;
  verifyWebhook(input: {
    rawBody: Buffer;
    signature: string | undefined;
  }): boolean;
}
