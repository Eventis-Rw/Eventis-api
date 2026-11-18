import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import type { OrganiserCatalog } from "../../src/common/contracts/organiser-catalog.js";
import { loadEnv } from "../../src/config/env.js";
import { DEFAULT_TERMS } from "../../src/modules/event-installments/domain/admin-workspace.types.js";
import type { InstallmentSnapshot } from "../../src/modules/event-installments/infrastructure/admin-workspace.repository.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";
const suite =
  process.env.RUN_ADMIN_INTEGRATION === "1" ? describe : describe.skip;
suite("admin organiser installment lifecycle", () => {
  const db = new PrismaClient(),
    base = "http://127.0.0.1:4001/api/v1";
  let token: string,
    customerId: string,
    templateId: string,
    agreementId: string,
    paymentId: string,
    reference: string;
  const headers = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  const read = async () => {
    const r = await fetch(base + "/admin/installment-workspace", {
      headers: headers(),
    });
    expect(r.status).toBe(200);
    return r.json() as Promise<InstallmentSnapshot>;
  };
  const send = async (
    command: unknown,
    revision: number,
    requestId = randomUUID(),
  ) =>
    fetch(base + "/admin/installment-workspace/commands", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ command, revision, requestId }),
    });
  const run = async (command: unknown) => {
    const before = await read();
    const r = await send(command, before.revision);
    if (r.status !== 200) throw new Error(await r.text());
    return r.json() as Promise<InstallmentSnapshot>;
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55437" ||
      url.pathname !== "/eventis_admin_integration"
    )
      throw Error("Isolated integration database required");
    const tokens = new TokenService(loadEnv(), new SystemClock());
    await db.user.upsert({
      where: { phone: "+250788000001" },
      create: {
        phone: "+250788000001",
        role: "ADMIN",
        status: "ACTIVE",
        pinHash: tokens.hashPin("12345"),
      },
      update: { status: "ACTIVE", pinHash: tokens.hashPin("12345") },
    });
    const customer = await db.user.upsert({
      where: { phone: "+250788000003" },
      create: {
        phone: "+250788000003",
        role: "CUSTOMER",
        email: "installments@example.invalid",
      },
      update: { email: "installments@example.invalid" },
    });
    customerId = customer.id;
    const response = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+250788000001", pin: "12345" }),
    });
    expect(response.ok).toBe(true);
    token = ((await response.json()) as { tokens: { accessToken: string } })
      .tokens.accessToken;
  });
  afterAll(() => db.$disconnect());
  it("persists the complete organiser installment lifecycle", async () => {
    {
      // requires authentication and persists the exact template terms
      expect((await fetch(base + "/admin/installment-workspace")).status).toBe(
        401,
      );
      const state = await run({
        type: "save_plan",
        name: "API lifecycle template",
        description: "Real database integration test",
        terms: {
          ...DEFAULT_TERMS,
          frequency: "weekly",
          installment_count: 3,
          interest: 5.25,
          grace_period_days: 0,
        },
      });
      const plan = state.state.plans.findLast(
        (p: { name: string }) => p.name === "API lifecycle template",
      )!;
      templateId = plan.id;
      expect(
        (
          await db.eventInstallmentPlan.findUniqueOrThrow({
            where: { id: templateId },
          })
        ).adminTerms,
      ).toEqual(JSON.parse(JSON.stringify(plan.terms)));
    }
    {
      // assigns an organiser purchase without inventing an event or trusting a client price
      const catalog = (await (
        await fetch(base + "/admin/organiser-catalog", { headers: headers() })
      ).json()) as OrganiserCatalog;
      const quote = catalog.plans
        .find((p: { id: string }) => p.id === "organiser_post")!
        .prices.find((p: { quantity: number }) => p.quantity === 2)!.total;
      const command = {
        type: "assign",
        customer_id: customerId,
        plan_id: templateId,
        product_id: "organiser_post",
        product_name: "Pay per post",
        quantity: 2,
        total_amount: 1,
        currency: "RWF",
        start_date: "2026-11-16",
        terms: DEFAULT_TERMS,
      };
      const previous = await read();
      expect((await send(command, previous.revision)).status).toBe(422);
      const state = await run({ ...command, total_amount: quote });
      const a = state.state.agreements.findLast(
        (a: { customer_id: string }) => a.customer_id === customerId,
      )!;
      agreementId = a.id;
      expect(a.total_amount).toBe(quote);
      const row = await db.eventInstallmentAgreement.findUniqueOrThrow({
        where: { id: agreementId },
      });
      expect(row.eventId).toBeNull();
      expect(row.productId).toBe("organiser_post");
      expect(row.quantity).toBe(2);
    }
    {
      // records a receipt once, preserves history and rejects duplicate references
      const before = await read();
      const schedule = before.state.schedules.find(
        (s: { agreement_id: string }) => s.agreement_id === agreementId,
      )!;
      reference = "ADMIN-" + randomUUID();
      const command = {
        type: "pay",
        agreement_id: agreementId,
        schedule_id: schedule.id,
        amount: 100,
        payment_method: "Cash",
        transaction_reference: reference,
      };
      const requestId = randomUUID();
      expect((await send(command, before.revision, requestId)).status).toBe(
        200,
      );
      expect((await send(command, before.revision, requestId)).status).toBe(
        200,
      );
      const after = await read();
      const receipt = after.state.payments.find(
        (p: { transaction_reference: string }) =>
          p.transaction_reference === reference,
      )!;
      paymentId = receipt.id;
      expect(receipt.amount).toBe(100);
      expect(
        (
          await db.eventInstallmentPayment.findUniqueOrThrow({
            where: { id: paymentId },
          })
        ).amountMinor,
      ).toBe(100n);
      expect(
        (
          await send(
            { ...command, transaction_reference: reference.toLowerCase() },
            after.revision,
          )
        ).status,
      ).toBe(422);
    }
    {
      // revises outstanding balances after payment without deleting the receipt
      const after = await run({
        type: "revise",
        agreement_id: agreementId,
        new_start_date: "2026-11-20",
        new_installment_count: 2,
        reason: "Restructure outstanding balance",
      });
      expect(
        after.state.payments.find((p: { id: string }) => p.id === paymentId)!
          .amount,
      ).toBe(100);
      expect(
        after.state.agreements.find(
          (a: { id: string }) => a.id === agreementId,
        )!.terms.installment_count,
      ).toBe(2);
      expect(
        (
          await db.eventInstallmentPayment.findUniqueOrThrow({
            where: { id: paymentId },
          })
        ).amountMinor,
      ).toBe(100n);
    }
    {
      // refunds part of the receipt and reopens the affected balance
      const after = await run({
        type: "refund",
        payment_id: paymentId,
        amount: 50,
        reason: "Partial refund recorded externally",
      });
      expect(
        after.state.payments.find((p: { id: string }) => p.id === paymentId)!
          .refunded,
      ).toBe(50);
      expect(
        (
          await db.eventInstallmentPayment.findUniqueOrThrow({
            where: { id: paymentId },
          })
        ).refundedAmountMinor,
      ).toBe(50n);
      expect(
        await db.eventInstallmentRefund.count({
          where: { installmentPaymentId: paymentId, status: "COMPLETED" },
        }),
      ).toBe(1);
    }
    {
      // adjusts due dates, applies a fee once and records reminders as pending
      let current = await read();
      const row = current.state.schedules.findLast(
        (s: { agreement_id: string; voided: boolean }) =>
          s.agreement_id === agreementId && !s.voided,
      )!;
      await run({
        type: "due_date",
        schedule_id: row.id,
        new_due_date: "2026-11-01",
        reason: "Test overdue due date",
      });
      current = await run({
        type: "fee",
        schedule_id: row.id,
        fee_type: "fixed",
        fee_amount: 25,
        reason: "Late fee after grace",
      });
      expect(
        current.state.schedules.find((s: { id: string }) => s.id === row.id)!
          .fee,
      ).toBe(25);
      expect(
        (
          await send(
            {
              type: "fee",
              schedule_id: row.id,
              fee_type: "fixed",
              fee_amount: 25,
              reason: "Duplicate must fail",
            },
            current.revision,
          )
        ).status,
      ).toBe(422);
      await run({
        type: "notify",
        schedule_id: row.id,
        notification_type: "overdue",
        channels: ["sms", "email"],
      });
      const n = await db.eventInstallmentNotification.findFirstOrThrow({
        where: { scheduleId: row.id },
        orderBy: { createdAt: "desc" },
      });
      expect(n.status).toBe("PENDING");
      expect(n.channels).toEqual(["SMS", "EMAIL"]);
    }
    {
      // cancels collection while preserving receipts and permitting refunds
      const current = await run({
        type: "cancel",
        agreement_id: agreementId,
        reason: "Customer purchase cancelled",
      });
      expect(
        current.state.agreements.find(
          (a: { id: string }) => a.id === agreementId,
        )!.cancelled,
      ).toBe(true);
      const payment = current.state.payments.find(
        (p: { id: string }) => p.id === paymentId,
      )!;
      expect(
        (
          await send(
            {
              type: "pay",
              agreement_id: agreementId,
              schedule_id: payment.schedule_id,
              amount: 1,
              payment_method: "Cash",
              transaction_reference: randomUUID(),
            },
            current.revision,
          )
        ).status,
      ).toBe(422);
      await run({
        type: "refund",
        payment_id: paymentId,
        amount: 10,
        reason: "Remaining cancellation refund",
      });
      const raw = await db.eventInstallmentAgreement.findUniqueOrThrow({
        where: { id: agreementId },
      });
      expect(raw.status).toBe("CANCELLED");
      expect(raw.outstandingBalanceMinor).toBe(0n);
    }
  });
});
