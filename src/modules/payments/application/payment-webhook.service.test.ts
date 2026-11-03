import { describe, expect, it } from "bun:test";

import type { Clock } from "../../../common/clock.js";
import type {
  InstallmentPlan,
  PaymentIntentWithPlan,
} from "../domain/payment.js";
import type { PaymentRepository } from "../infrastructure/payment.repository.js";
import type { PaymentProvider } from "../infrastructure/providers/payment-provider.js";

import type { PaymentActivationService } from "./payment-activation.service.js";
import {
  PaymentWebhookService,
  type PaymentWebhookInput,
} from "./payment-webhook.service.js";

const now = new Date("2026-10-30T10:00:00.000Z");

const plan: InstallmentPlan = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  accountType: "PRIVATE",
  interval: "MONTHLY",
  durationDays: 30,
  priceMinor: 15000n,
  currency: "RWF",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const payment: PaymentIntentWithPlan = {
  id: "550e8400-e29b-41d4-a716-446655440011",
  reference: "PAY-123",
  userId: "550e8400-e29b-41d4-a716-446655440012",
  installmentPlanId: plan.id,
  accountType: "PRIVATE",
  amountMinor: 15000n,
  currency: "RWF",
  paymentMethod: "MTN_MOMO",
  phoneNumber: "+250788123456",
  status: "AWAITING_USER",
  provider: "test",
  providerTransactionId: null,
  failureReason: null,
  idempotencyKey: null,
  expiresAt: new Date("2026-10-30T10:10:00.000Z"),
  providerRequestedAt: now,
  paidAt: null,
  createdAt: now,
  updatedAt: now,
  plan,
};

function input(
  overrides: Partial<PaymentWebhookInput> = {},
): PaymentWebhookInput {
  return {
    providerEventId: "evt_123",
    eventType: "payment.succeeded",
    paymentReference: payment.reference,
    status: "succeeded",
    amountMinor: payment.amountMinor,
    currency: "RWF",
    providerTransactionId: "provider-123",
    rawBody: Buffer.from("{}"),
    signature: "signature",
    payload: { event_id: "evt_123" },
    ...overrides,
  };
}

function setup(
  options: {
    signatureValid?: boolean;
    duplicate?: boolean;
    current?: PaymentIntentWithPlan;
  } = {},
) {
  const calls = {
    find: 0,
    updates: [] as Array<{ id: string; input: unknown }>,
    activations: [] as Array<{
      payment: unknown;
      plan: unknown;
      now: unknown;
    }>,
    processed: [] as Array<{ id: string; input: unknown }>,
  };
  const updated = { ...payment, status: "PROVIDER_REQUESTED" as const };
  const repository = {
    findPaymentByIdentifier: () => {
      calls.find += 1;
      return Promise.resolve(options.current ?? payment);
    },
    recordWebhookEvent: () =>
      Promise.resolve({
        event: {
          id: "event-id",
          provider: "test",
          providerEventId: "evt_123",
          paymentIntentId: payment.id,
          processedAt: options.duplicate ? now : null,
        },
        duplicate: options.duplicate ?? false,
      }),
    updatePaymentIntent: (id: string, update: unknown) => {
      calls.updates.push({ id, input: update });
      return Promise.resolve(updated);
    },
    markWebhookEventProcessed: (id: string, update: unknown) => {
      calls.processed.push({ id, input: update });
      return Promise.resolve();
    },
  } as unknown as PaymentRepository;
  const activation = {
    activate: (
      activatedPayment: unknown,
      activatedPlan: unknown,
      at: unknown,
    ) => {
      calls.activations.push({
        payment: activatedPayment,
        plan: activatedPlan,
        now: at,
      });
      return Promise.resolve({});
    },
  } as unknown as PaymentActivationService;
  const provider = {
    name: "test",
    verifyWebhook: () => options.signatureValid ?? true,
  } as unknown as PaymentProvider;
  const clock = { now: () => now } as unknown as Clock;
  const service = new PaymentWebhookService(
    repository,
    activation,
    clock,
    provider,
  );
  return { service, calls };
}

describe("PaymentWebhookService", () => {
  it("rejects an invalid signature before touching the database", async () => {
    const { service, calls } = setup({ signatureValid: false });

    let caught: unknown;
    try {
      await service.process(input());
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(calls.find).toBe(0);
  });

  it("acknowledges an already processed duplicate without replaying activation", async () => {
    const { service, calls } = setup({ duplicate: true });

    const result = await service.process(input());
    expect(result).toEqual({ received: true, duplicate: true });
    expect(calls.activations).toEqual([]);
  });

  it("activates a succeeded payment and marks the webhook processed", async () => {
    const { service, calls } = setup();

    const result = await service.process(input());
    expect(result).toEqual({ received: true, duplicate: false });
    expect(calls.updates).toEqual([
      {
        id: payment.id,
        input: {
          status: "PROVIDER_REQUESTED",
          providerTransactionId: "provider-123",
        },
      },
    ]);
    expect(calls.activations).toHaveLength(1);
    expect(calls.activations[0]?.payment).toEqual(
      expect.objectContaining({ id: payment.id }),
    );
    expect(calls.activations[0]?.plan).toEqual(plan);
    expect(calls.activations[0]?.now).toEqual(now);
    expect(calls.processed).toEqual([
      {
        id: "event-id",
        input: { paymentIntentId: payment.id, processedAt: now },
      },
    ]);
  });

  it("rejects an amount mismatch and leaves the event retryable", async () => {
    const { service, calls } = setup();

    let caught: unknown;
    try {
      await service.process(input({ amountMinor: 1n }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(calls.activations).toEqual([]);
    expect(calls.processed).toHaveLength(1);
    expect(calls.processed[0]?.input).toEqual(
      expect.objectContaining({ processedAt: null }),
    );
  });

  it("does not downgrade a terminal payment on a late pending event", async () => {
    const { service, calls } = setup({
      current: { ...payment, status: "FAILED" },
    });

    const result = await service.process(
      input({ status: "pending", eventType: "payment.pending" }),
    );
    expect(result).toEqual({ received: true, duplicate: false });
    expect(calls.updates).toEqual([]);
  });
});
