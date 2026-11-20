import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import { loadEnv } from "../../src/config/env.js";
import { defaultPermissions } from "../../src/modules/findlove/domain/admin-membership.js";
import type { MembershipSnapshot } from "../../src/modules/findlove/infrastructure/admin-membership.repository.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";
const suite =
  process.env.RUN_ADMIN_INTEGRATION === "1" ? describe : describe.skip;
suite("FindLove admin canonical persistence", () => {
  const db = new PrismaClient();
  const base = "http://127.0.0.1:4001/api/v1";
  let admin: string,
    customerToken: string,
    adminId: string,
    publicId: string,
    privateId: string,
    caseId: string;
  const read = async () => {
    const response = await fetch(base + "/admin/findlove-workspace", {
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(response.status).toBe(200);
    return response.json() as Promise<MembershipSnapshot>;
  };
  const send = async (
    command: unknown,
    revision: number,
    requestId = randomUUID(),
  ) =>
    fetch(base + "/admin/findlove-workspace/commands", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command, revision, requestId }),
    });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55437" ||
      url.pathname !== "/eventis_admin_integration"
    )
      throw Error("Only the isolated integration database is allowed");
    const tokens = new TokenService(loadEnv(), new SystemClock());
    const identities = [];
    for (const [i, role] of [
      [1, "ADMIN"],
      [2, "CUSTOMER"],
      [3, "CUSTOMER"],
    ] as const) {
      const phone = `+25078810000${i}`;
      const user = await db.user.upsert({
        where: { phone },
        create: {
          phone,
          role,
          status: "ACTIVE",
          pinHash: tokens.hashPin("12345"),
          displayName: `Membership test ${i}`,
        },
        update: {
          status: "ACTIVE",
          adminAccountStatus: null,
          pinHash: tokens.hashPin("12345"),
        },
      });
      identities.push(user.id);
      await db.loveProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          username: `membership_test_${i}`,
          gender: "MAN",
          interestedIn: "EVERYONE",
          dateOfBirth: new Date("1995-01-01"),
          country: "Rwanda",
          city: "Kigali",
          neighborhood: "Kiyovu",
        },
        update: {},
      });
      await db.ageVerification.create({
        data: {
          userId: user.id,
          documentType: "PASSPORT",
          frontKey: "integration-only/document",
          dateOfBirth: new Date("1995-01-01"),
          status: "VERIFIED",
          adultConfirmedAt: new Date(),
        },
      });
      await db.paymentIntent.updateMany({
        where: {
          userId: user.id,
          provider: "admin_recorded",
          status: {
            in: [
              "CREATED",
              "AWAITING_USER",
              "PROVIDER_REQUESTED",
              "UNKNOWN",
              "RECONCILING",
            ],
          },
        },
        data: {
          status: "FAILED",
          failureReason: "Reset isolated integration fixture",
        },
      });
      await db.serviceSubscription.deleteMany({
        where: { userId: user.id, service: "FINDLOVE" },
      });
      const tier = i === 2 ? "PUBLIC" : "PRIVATE";
      const plan = await db.installmentPlan.findUniqueOrThrow({
        where: {
          accountType_interval: { accountType: tier, interval: "MONTHLY" },
        },
      });
      await db.serviceSubscription.create({
        data: {
          userId: user.id,
          service: "FINDLOVE",
          accountType: tier,
          installmentPlanId: plan.id,
          startsAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 30 * 86400000),
          priceMinor: plan.priceMinor,
          permissionsSnapshot: defaultPermissions(),
        },
      });
      const result = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin: "12345" }),
      });
      expect(result.ok).toBe(true);
      const session = (await result.json()) as {
        tokens: { accessToken: string };
      };
      if (i === 1) admin = session.tokens.accessToken;
      if (i === 2) customerToken = session.tokens.accessToken;
    }
    [adminId, publicId, privateId] = identities as [string, string, string];
    const report = await db.userReport.create({
      data: {
        reporterId: publicId,
        reportedUserId: privateId,
        reason: "SPAM",
        details: "Integration test report",
      },
    });
    caseId = report.id;
  });
  afterAll(() => db.$disconnect());
  it("requires admin access and returns real members", async () => {
    expect((await fetch(base + "/admin/findlove-workspace")).status).toBe(401);
    expect(
      (
        await fetch(base + "/admin/findlove-workspace", {
          headers: { Authorization: `Bearer ${customerToken}` },
        })
      ).status,
    ).toBe(403);
    const current = await read();
    expect(
      current.state.members.some((m: { id: string }) => m.id === publicId),
    ).toBe(true);
    expect(
      current.state.members.some((m: { id: string }) => m.id.startsWith("FL-")),
    ).toBe(false);
  });
  it("saves rules without rewriting existing purchased permissions", async () => {
    const current = await read();
    const permissions = defaultPermissions();
    permissions.public.private = true;
    const result = await send(
      { type: "rules", permissions, reason: "Test new membership rules" },
      current.revision,
    );
    expect(result.status).toBe(200);
    const after = (await result.json()) as MembershipSnapshot;
    expect(after.state.permissions.public.private).toBe(true);
    expect(
      after.state.members.find((m: { id: string }) => m.id === publicId)!
        .membership!.permissions.public.private,
    ).toBe(false);
    expect(
      (
        await send(
          { type: "rules", permissions, reason: "Reject stale update" },
          current.revision,
        )
      ).status,
    ).toBe(409);
  });
  it("extends a membership once even when the same request is retried", async () => {
    const current = await read();
    const before = Date.parse(
      current.state.members.find((m: { id: string }) => m.id === publicId)!
        .membership!.expiresAt,
    );
    const requestId = randomUUID(),
      command = {
        type: "member",
        id: publicId,
        action: "extend",
        days: 7,
        reason: "Test complimentary extension",
      };
    expect((await send(command, current.revision, requestId)).status).toBe(200);
    expect((await send(command, current.revision, requestId)).status).toBe(200);
    const after = await read();
    expect(
      Date.parse(
        after.state.members.find((m: { id: string }) => m.id === publicId)!
          .membership!.expiresAt,
      ),
    ).toBe(before + 7 * 86400000);
  });
  it("persists grants without creating a payment and propagates revocation", async () => {
    let current = await read();
    const paymentCount = await db.paymentIntent.count();
    expect(
      (
        await send(
          {
            type: "member",
            id: publicId,
            action: "revoke",
            reason: "Test revocation",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    expect(
      await db.serviceSubscription.count({
        where: { userId: publicId, service: "FINDLOVE", revokedAt: null },
      }),
    ).toBe(0);
    current = await read();
    expect(
      (
        await send(
          {
            type: "member",
            id: publicId,
            action: "grant",
            planId: "findlove_public_week",
            reason: "Test complimentary grant",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    const after = await read();
    expect(
      after.state.members.find((m: { id: string }) => m.id === publicId)!
        .membership!.permissions.public.private,
    ).toBe(true);
    expect(await db.paymentIntent.count()).toBe(paymentCount);
  });
  it("blocks self-suspension and closes a safety report atomically", async () => {
    let current = await read();
    expect(
      (
        await send(
          {
            type: "member",
            id: adminId,
            action: "suspend",
            reason: "Self suspension must fail",
          },
          current.revision,
        )
      ).status,
    ).toBe(422);
    current = await read();
    expect(
      (
        await send(
          {
            type: "report",
            id: caseId,
            decision: "suspend",
            reason: "Review confirms spam report",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: privateId } })).status,
    ).toBe("INACTIVE");
    expect(
      (await db.userReport.findUniqueOrThrow({ where: { id: caseId } })).status,
    ).toBe("REVIEWED");
    const audit = await db.auditLog.findFirst({
      where: {
        actorId: adminId,
        action: { startsWith: "findlove.admin.report" },
      },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
  });
  it("records external payments without gateway calls and settles using the original quote", async () => {
    let current = await read();
    const original = current.state.plans.find(
      (p: { id: string }) => p.id === "findlove_public_week",
    )!.price;
    const originalExpiry = current.state.members.find(
      (m: { id: string }) => m.id === publicId,
    )!.membership!.expiresAt;
    const reference = "EXT-" + randomUUID();
    const response = await send(
      {
        type: "checkout",
        id: publicId,
        planId: "findlove_public_week",
        method: "MTN MoMo",
        outcome: "pending",
        reason: reference,
      },
      current.revision,
    );
    if (!response.ok) throw new Error(await response.text());
    expect(response.status).toBe(200);
    current = (await response.json()) as MembershipSnapshot;
    const payment = current.state.payments.find(
      (p: { memberId: string; status: string }) =>
        p.memberId === publicId && p.status === "pending",
    )!;
    expect(payment.amount).toBe(original);
    expect(
      current.state.members.find((m: { id: string }) => m.id === publicId)!
        .membership!.expiresAt,
    ).toBe(originalExpiry);
    const raw = await db.paymentIntent.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(raw.provider).toBe("admin_recorded");
    expect(raw.status).toBe("AWAITING_USER");
    const statusResponse = await fetch(
      base + "/payments/" + payment.id + "/status",
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );
    expect(statusResponse.status).toBe(200);
    expect(
      ((await statusResponse.json()) as { payment_status: string })
        .payment_status,
    ).toBe("pending");
    const untouched = await db.paymentIntent.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(untouched.updatedAt.toISOString()).toBe(raw.updatedAt.toISOString());
    expect(untouched.providerTransactionId).toBe(raw.providerTransactionId);
    expect(
      (
        await send(
          {
            type: "plan",
            id: "findlove_public_week",
            price: original + 100,
            active: true,
            reason: "Price changes after invoice",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    current = await read();
    expect(
      (
        await send(
          {
            type: "settle",
            id: payment.id,
            outcome: "success",
            reason: "External receipt confirmed",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    const after = await read();
    const member = after.state.members.find(
      (m: { id: string }) => m.id === publicId,
    )!;
    expect(member.membership!.price).toBe(original);
    expect(Date.parse(member.membership!.expiresAt)).toBe(
      Date.parse(originalExpiry) + 7 * 86400000,
    );
    expect(
      (
        await db.serviceSubscription.findUniqueOrThrow({
          where: { paymentIntentId: payment.id },
        })
      ).priceMinor,
    ).toBe(BigInt(original));
    expect(
      (
        await send(
          {
            type: "checkout",
            id: publicId,
            planId: "findlove_public_week",
            method: "MTN MoMo",
            outcome: "success",
            reason: reference.toLowerCase(),
          },
          after.revision,
        )
      ).status,
    ).toBe(409);
  });
  it("keeps paid purchase terms intact when a later complimentary grant changes tiers", async () => {
    const paid = await db.serviceSubscription.findFirstOrThrow({
      where: {
        userId: publicId,
        paymentIntentId: { not: null },
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    let current = await read();
    expect(
      (
        await send(
          {
            type: "member",
            id: publicId,
            action: "revoke",
            reason: "Close membership before changing tier",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    current = await read();
    const receipts = await db.paymentIntent.count({
      where: { userId: publicId },
    });
    expect(
      (
        await send(
          {
            type: "member",
            id: publicId,
            action: "grant",
            planId: "findlove_private_week",
            reason: "Complimentary private access",
          },
          current.revision,
        )
      ).status,
    ).toBe(200);
    const original = await db.serviceSubscription.findUniqueOrThrow({
      where: { id: paid.id },
    });
    expect(original.installmentPlanId).toBe(paid.installmentPlanId);
    expect(original.priceMinor).toBe(paid.priceMinor);
    expect(original.startsAt).toEqual(paid.startsAt);
    expect(original.expiresAt).toEqual(paid.expiresAt);
    expect(original.permissionsSnapshot).toEqual(paid.permissionsSnapshot);
    expect(original.revokedAt).not.toBeNull();
    const active = await db.serviceSubscription.findFirstOrThrow({
      where: { userId: publicId, service: "FINDLOVE", revokedAt: null },
    });
    expect(active.id).not.toBe(paid.id);
    expect(active.paymentIntentId).toBeNull();
    expect(active.accountType).toBe("PRIVATE");
    expect(await db.paymentIntent.count({ where: { userId: publicId } })).toBe(
      receipts,
    );
  });
});
