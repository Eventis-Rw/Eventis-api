import { createHmac, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ENV, type Env } from "../../../../config/env.js";
import type {
  PaymentMethod,
  ProviderPaymentStatus,
} from "../../domain/payment.js";

import type {
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRequestInput,
} from "./payment-provider.js";

const providerResponse = z
  .object({
    transaction_id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

@Injectable()
export class AggregatorPaymentProvider implements PaymentProvider {
  readonly name = "aggregator";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async requestPayment(
    input: ProviderRequestInput,
  ): Promise<ProviderPaymentResult> {
    const body = await this.call("/payments", {
      method: "POST",
      body: JSON.stringify({
        reference: input.reference,
        amount_minor: input.amountMinor.toString(10),
        currency: input.currency,
        payment_method: toProviderMethod(input.paymentMethod),
        phone_number: input.phoneNumber,
      }),
    });
    return toResult(body);
  }

  async getStatus(input: {
    reference: string;
    providerTransactionId: string | null;
  }): Promise<ProviderPaymentResult> {
    const query = input.providerTransactionId
      ? `?transaction_id=${encodeURIComponent(input.providerTransactionId)}`
      : "";
    const body = await this.call(
      `/payments/${encodeURIComponent(input.reference)}${query}`,
      { method: "GET" },
    );
    return toResult(body);
  }

  verifyWebhook(input: {
    rawBody: Buffer;
    signature: string | undefined;
  }): boolean {
    const secret = this.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !input.signature) return false;

    const received = input.signature
      .replace(/^sha256=/i, "")
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(received)) return false;

    const expected = createHmac("sha256", secret)
      .update(input.rawBody)
      .digest("hex");
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
  }

  private async call(path: string, init: RequestInit): Promise<unknown> {
    const baseUrl = this.env.PAYMENT_PROVIDER_BASE_URL;
    const apiKey = this.env.PAYMENT_PROVIDER_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("Payment provider base URL and API key are required");
    }

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Payment provider returned HTTP ${response.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("Payment provider returned invalid JSON");
    }
  }
}

function toResult(payload: unknown): ProviderPaymentResult {
  const parsed = providerResponse.parse(payload);
  const transactionId = parsed.transaction_id ?? parsed.id;
  return {
    status: normalizeStatus(parsed.status),
    providerTransactionId:
      transactionId === undefined ? null : String(transactionId),
    ...(parsed.message ? { message: parsed.message } : {}),
  };
}

function normalizeStatus(status: string | undefined): ProviderPaymentStatus {
  const value = status?.trim().toLowerCase();
  if (
    value === "success" ||
    value === "successful" ||
    value === "succeeded" ||
    value === "paid" ||
    value === "completed"
  ) {
    return "SUCCEEDED";
  }
  if (value === "failed" || value === "failure" || value === "declined") {
    return "FAILED";
  }
  if (value === "cancelled" || value === "canceled") return "CANCELLED";
  if (
    value === "pending" ||
    value === "processing" ||
    value === "awaiting_user" ||
    value === "requested"
  ) {
    return "PENDING";
  }
  return "UNKNOWN";
}

function toProviderMethod(method: PaymentMethod): string {
  return method === "MTN_MOMO" ? "mtn_momo" : "airtel_money";
}
