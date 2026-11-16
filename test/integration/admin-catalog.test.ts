import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import { loadEnv } from "../../src/config/env.js";
import type { PrismaService } from "../../src/infrastructure/database/prisma.service.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";
import { defaultOrganiserCatalog } from "../../src/modules/organisations/domain/admin-catalog.js";
import { OrganisationRepository } from "../../src/modules/organisations/infrastructure/organisation.repository.js";
const enabled = process.env.RUN_ADMIN_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;
suite("admin catalog HTTP/database integration", () => {
  const db = new PrismaClient();
  const base = "http://127.0.0.1:4001/api/v1";
  let token: string, customerToken: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55437" ||
      url.pathname !== "/eventis_admin_integration"
    )
      throw new Error(
        "This suite only runs against the isolated integration database",
      );
    const tokens = new TokenService(loadEnv(), new SystemClock());
    for (const [phone, role] of [
      ["+250788000001", "ADMIN"],
      ["+250788000002", "CUSTOMER"],
    ] as const) {
      await db.user.upsert({
        where: { phone },
        create: {
          phone,
          role,
          status: "ACTIVE",
          displayName: "Integration test",
          pinHash: tokens.hashPin("12345"),
        },
        update: { role, status: "ACTIVE", pinHash: tokens.hashPin("12345") },
      });
    }
    for (const [phone, isAdmin] of [
      ["+250788000001", true],
      ["+250788000002", false],
    ] as const) {
      const response = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin: "12345" }),
      });
      expect(response.ok).toBe(true);
      const session = (await response.json()) as {
        tokens: { accessToken: string };
      };
      if (isAdmin) token = session.tokens.accessToken;
      else customerToken = session.tokens.accessToken;
    }
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  const read = () =>
    fetch(base + "/admin/organiser-catalog", {
      headers: { Authorization: `Bearer ${token}` },
    });
  const save = (body: unknown) =>
    fetch(base + "/admin/organiser-catalog", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  it("requires authentication and admin authorization", async () => {
    expect((await fetch(base + "/admin/organiser-catalog")).status).toBe(401);
    expect(
      (
        await fetch(base + "/admin/organiser-catalog", {
          headers: { Authorization: `Bearer ${customerToken}` },
        })
      ).status,
    ).toBe(403);
  });
  it("preserves exact bundle totals, descriptions and payment settings in canonical tables", async () => {
    const previous = (await (await read()).json()) as { revision: number };
    const catalog = defaultOrganiserCatalog();
    catalog.plans[0]!.prices[1]!.total = 4100;
    catalog.plans[0]!.description = "Integration-tested exact post bundles";
    catalog.payment_methods = ["airtel_money"];
    const saved = await save({ ...catalog, revision: previous.revision });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as ReturnType<
      typeof defaultOrganiserCatalog
    > & { revision: number };
    expect(body.revision).toBe(previous.revision + 1);
    expect(body.plans.find((p) => p.id === "organiser_post")!.prices).toEqual([
      { quantity: 1, total: 2180 },
      { quantity: 2, total: 4100 },
    ]);
    expect(body.payment_methods).toEqual(["airtel_money"]);
    const native = await db.organiserPlan.findUniqueOrThrow({
      where: { frontendId: "organiser_post" },
    });
    expect(native.priceMinor).toBe(2180n);
    expect(native.description).toBe(catalog.plans[0]!.description);
    expect(
      ((await (await read()).json()) as { revision: number }).revision,
    ).toBe(body.revision);
    expect(
      (await save({ ...catalog, revision: previous.revision })).status,
    ).toBe(409);
  });
  it("rejects invalid prices and malformed settings without persisting partial changes", async () => {
    const current = (await (await read()).json()) as ReturnType<
      typeof defaultOrganiserCatalog
    > & { revision: number };
    const before = await db.organiserPlan.count();
    current.plans[0]!.prices[0]!.total = -1;
    expect((await save(current)).status).toBe(422);
    expect((await save(null)).status).toBe(422);
    expect(await db.organiserPlan.count()).toBe(before);
    expect(
      ((await (await read()).json()) as { revision: number }).revision,
    ).toBe(current.revision);
  });
  it("keeps a pending purchase’s original duration after a plan edit", async () => {
    const repository = new OrganisationRepository(
      db as PrismaService,
      new SystemClock(),
    );
    const customer = await db.user.findUniqueOrThrow({
      where: { phone: "+250788000002" },
    });
    const plan = await db.organiserPlan.findUniqueOrThrow({
      where: { frontendId: "organiser_monthly" },
    });
    const purchase = await repository.createSubscription({
      userId: customer.id,
      planId: plan.id,
      paymentMethod: "AIRTEL_MONEY",
      phoneNumber: customer.phone,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      provider: "fake",
      expiresAt: new Date(Date.now() + 3600000),
    });
    const current = (await (await read()).json()) as ReturnType<
      typeof defaultOrganiserCatalog
    > & { revision: number };
    const edited = current.plans.find(
      (p: { id: string }) => p.id === "organiser_monthly",
    )!;
    edited.interval = "year";
    edited.prices = [{ quantity: 1, total: 170000 }];
    expect((await save(current)).status).toBe(200);
    const start = new Date("2026-11-16T12:00:00Z");
    const activated = await repository.activateSubscription({
      id: purchase.subscription.id,
      now: start,
    });
    expect(activated!.expiresAt!.getTime() - start.getTime()).toBe(
      30 * 86400000,
    );
    const payment = await db.paymentIntent.findUniqueOrThrow({
      where: { id: purchase.paymentId },
    });
    expect(payment.amountMinor).toBe(plan.priceMinor);
  });
});
