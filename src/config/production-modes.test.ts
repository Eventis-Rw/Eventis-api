import assert from "node:assert/strict";

import { describe, expect, it } from "bun:test";

import { DisabledEmailProvider } from "../infrastructure/email/disabled-email.provider.js";
import { ManualOnlyPaymentProvider } from "../modules/payments/infrastructure/providers/manual-only-payment.provider.js";

describe("production modes without automated providers", () => {
  it("never collects payments, polls a provider or accepts a webhook in manual mode", async () => {
    const provider = new ManualOnlyPaymentProvider();
    await assert.rejects(provider.requestPayment(), { status: 403 });
    await assert.rejects(provider.getStatus(), { status: 403 });
    expect(provider.verifyWebhook()).toBe(false);
  });
  it("rejects email sends explicitly rather than pretending to deliver", async () => {
    await assert.rejects(new DisabledEmailProvider().send(), { status: 503 });
  });
});
