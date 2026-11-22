import { randomInt, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import { loadEnv } from "../../src/config/env.js";
import type { MembershipSnapshot } from "../../src/modules/findlove/infrastructure/admin-membership.repository.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";

const suite =
  process.env.RUN_FLOW_INTEGRATION === "1" ? describe : describe.skip;
suite("repairs to the demonstrated application flows", () => {
  const db = new PrismaClient();
  const base = process.env.FLOW_API_URL ?? "http://127.0.0.1:4100/api/v1";
  const users: string[] = [];
  let admin: string,
    member: string,
    memberId: string,
    organiser: string,
    organiserId: string;
  let verificationId: string, manualId: string, planId: string, roleId: string;
  let categoryId: string;
  const request = (
    path: string,
    token: string | null,
    method = "GET",
    body?: unknown,
  ) =>
    fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  async function json<T = unknown>(
    path: string,
    token: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await request(path, token, method, body);
    if (!response.ok)
      throw Error(
        `${method} ${path}: ${response.status} ${await response.text()}`,
      );
    return response.json() as Promise<T>;
  }
  async function identity(
    role: "ADMIN" | "CUSTOMER" = "CUSTOMER",
    consoleRoleId?: string,
  ) {
    const phone = `+25079${randomInt(1000000, 9999999)}`;
    const tokens = new TokenService(loadEnv(), new SystemClock());
    const user = await db.user.create({
      data: {
        phone,
        firstName: `Flow repair ${role}`,
        role,
        phoneVerifiedAt: new Date(),
        pinHash: tokens.hashPin("24680"),
        ...(consoleRoleId ? { consoleRoleId } : {}),
      },
    });
    users.push(user.id);
    return {
      id: user.id,
      token: (
        await json<{ tokens: { accessToken: string } }>(
          "/auth/login",
          "",
          "POST",
          { phone, pin: "24680" },
        )
      ).tokens.accessToken,
    };
  }
  async function upload(
    token: string,
    purpose: "AGE_ID" | "PAYMENT_RECEIPT" | "VERIFICATION_DOC",
  ) {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zmcAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.append("purpose", purpose);
    form.append(
      "file",
      new Blob([png], { type: "image/png" }),
      "synthetic-test.png",
    );
    const response = await fetch(base + "/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ id: string; key: string }>;
  }
  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1"].includes(database.hostname) ||
      !/^\/eventis_(demo_report_\d+|flow_integration)$/.test(database.pathname)
    )
      throw Error("Use an isolated local flow-test database");
    if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
      throw Error("Use a local API");
    admin = (await identity("ADMIN")).token;
    ({ id: memberId, token: member } = await identity());
    ({ id: organiserId, token: organiser } = await identity());
    categoryId = (await db.category.findFirstOrThrow()).id;
  });
  afterAll(async () => {
    if (users.length) {
      await db.manualPaymentSubmission.deleteMany({
        where: { userId: { in: users } },
      });
      await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    if (planId) await db.organiserPlan.deleteMany({ where: { id: planId } });
    if (roleId) await db.consoleRole.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });
  it("loads and persists settings and publisher categories using the canonical routes", async () => {
    expect(
      (
        await json<{ items: { id: string }[] }>("/events/categories", member)
      ).items.some((row: { id: string }) => row.id === categoryId),
    ).toBe(true);
    await json("/me/preferences", member, "PATCH", {
      preferredLocation: "Huye",
      categoryIds: [categoryId],
    });
    expect(await json("/me/preferences", member)).toMatchObject({
      preferredLocation: "Huye",
      categoryIds: [categoryId],
    });
    expect((await request("/me/console-access", null)).status).toBe(401);
    expect(
      (await json<{ unrestricted: boolean }>("/me/console-access", admin))
        .unrestricted,
    ).toBe(true);
    expect((await request("/admin/console-roles", admin)).status).toBe(200);
    expect((await request("/admin/eventis/settings", member)).status).toBe(403);
  });
  it("includes an applicant before profile creation and protects their document", async () => {
    const document = await upload(member, "AGE_ID");
    await json("/findlove/age-verification", member, "POST", {
      documentType: "PASSPORT",
      frontKey: document.key,
      adultConfirmed: true,
      dateOfBirth: "1998-03-15",
    });
    const snapshot = await json<MembershipSnapshot>(
      "/admin/findlove-workspace",
      admin,
    );
    const applicant = snapshot.state.members.find(
      (row: { id: string }) => row.id === memberId,
    );
    expect(applicant).toMatchObject({
      verification: "pending",
      dob: "1998-03-15",
    });
    if (!applicant?.verificationId)
      throw Error("Applicant document missing from the review queue");
    verificationId = applicant.verificationId;
    expect(
      await db.loveProfile.findUnique({ where: { userId: memberId } }),
    ).toBeNull();
    const path = `/findlove/admin/age-verifications/${verificationId}/documents/front`;
    expect((await request(path, admin)).headers.get("content-type")).toContain(
      "image/png",
    );
    expect((await request(path, member)).status).toBe(403);
    const limited = await db.consoleRole.create({
      data: {
        name: `Flow role ${randomUUID()}`,
        permissions: ["reports:manage"],
      },
    });
    roleId = limited.id;
    expect(
      (await request(path, (await identity("ADMIN", roleId)).token)).status,
    ).toBe(403);
    await json("/admin/findlove-workspace/commands", admin, "POST", {
      command: {
        type: "verify",
        id: memberId,
        decision: "verified",
        reason: "Checked the synthetic adult document",
      },
      revision: snapshot.revision,
      requestId: randomUUID(),
    });
    expect(
      (await json<{ status: string }>("/findlove/age-verification", member))
        .status,
    ).toBe("VERIFIED");
  });
  it("approves once under concurrent retries and includes the receipt in revenue and audit", async () => {
    const receipt = await upload(member, "PAYMENT_RECEIPT");
    const plan = await db.installmentPlan.findFirstOrThrow({
      where: { isActive: true, accountType: "PUBLIC", interval: "MONTHLY" },
    });
    const method = (
      await json<{ items: { id: string }[] }>(
        "/manual-payments/methods?platform=findlove",
        member,
      )
    ).items[0];
    if (!method)
      throw Error(
        "Seed at least one active manual payment method for this local test",
      );
    const payment = await json<{ id: string; reference: string }>(
      "/manual-payments",
      member,
      "POST",
      {
        platform: "findlove",
        installment_plan_id: plan.id,
        payment_method_id: method.id,
        receipt_upload_id: receipt.id,
      },
    );
    manualId = payment.id;
    const responses = await Promise.all([
      request(`/admin/manual-payments/${manualId}/approve`, admin, "POST"),
      request(`/admin/manual-payments/${manualId}/approve`, admin, "POST"),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      await db.serviceSubscription.count({ where: { userId: memberId } }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { subjectId: manualId } })).toBe(1);
    const snapshot = await json<MembershipSnapshot>(
      "/admin/findlove-workspace",
      admin,
    );
    expect(
      snapshot.state.payments.find(
        (row: { id: string }) => row.id === manualId,
      ),
    ).toMatchObject({
      source: "manual",
      reference: payment.reference,
      amount: Number(plan.priceMinor),
      status: "success",
    });
    expect(
      snapshot.state.audit.some(
        (row: { target: string }) => row.target === payment.reference,
      ),
    ).toBe(true);
    const settle = await request(
      "/admin/findlove-workspace/commands",
      admin,
      "POST",
      {
        command: {
          type: "settle",
          id: manualId,
          outcome: "success",
          reason: "Attempt to bypass receipt review",
        },
        revision: snapshot.revision,
        requestId: randomUUID(),
      },
    );
    expect(settle.status).toBe(422);
  });
  it("rolls back failed activation and preserves the purchased organiser terms", async () => {
    const plan = await db.organiserPlan.create({
      data: {
        code: `flow-${randomUUID()}`,
        name: "Flow test plan",
        interval: "MONTHLY",
        priceMinor: 10000n,
        durationDays: 10,
        postQuota: 5,
      },
    });
    planId = plan.id;
    const receipt = await upload(organiser, "PAYMENT_RECEIPT");
    const method = (
      await json<{ items: { id: string }[] }>(
        "/manual-payments/methods?platform=organiser",
        organiser,
      )
    ).items[0];
    const payment = await json<{ id: string; reference: string }>(
      "/manual-payments",
      organiser,
      "POST",
      {
        platform: "organiser",
        organiser_plan_id: plan.id,
        payment_method_id: method!.id,
        receipt_upload_id: receipt.id,
      },
    );
    await db.organiserPlan.update({
      where: { id: plan.id },
      data: {
        active: false,
        durationDays: 20,
        postQuota: 99,
        priceMinor: 50000n,
      },
    });
    expect(
      (
        await request(
          `/admin/manual-payments/${payment.id}/approve`,
          admin,
          "POST",
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await db.manualPaymentSubmission.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
    ).toBe("PENDING");
    expect(await db.auditLog.count({ where: { subjectId: payment.id } })).toBe(
      0,
    );
    await db.organiserPlan.update({
      where: { id: plan.id },
      data: { active: true },
    });
    await json(`/admin/manual-payments/${payment.id}/approve`, admin, "POST");
    const subscription = await db.organiserSubscription.findFirstOrThrow({
      where: { userId: organiserId },
    });
    expect(subscription.postsRemaining).toBe(5);
    expect(
      subscription.expiresAt!.getTime() - subscription.startsAt!.getTime(),
    ).toBe(10 * 86400000);
    expect(
      (
        await json<{ items: { id: string }[] }>(
          "/admin/organiser-subscriptions",
          admin,
        )
      ).items.some((row: { id: string }) => row.id === subscription.id),
    ).toBe(true);
  });
  it("round-trips organisation creation, selection and business verification", async () => {
    const created = await json<{ id: string }>(
      "/organisations",
      organiser,
      "POST",
      {
        name: "Flow test organisation",
        description: "Local synthetic organisation for regression verification",
        activities: "Community music",
        location: "Kigali",
      },
    );
    expect(created.id).toBeString();
    const list = await json<{
      activeOrganisationId: string;
      items: { id: string }[];
    }>("/me/organisations", organiser);
    expect(list.activeOrganisationId).toBe(created.id);
    expect(list.items[0]?.id).toBe(created.id);
    await json("/me/publisher-profile", organiser, "PATCH", {
      categoryIds: [categoryId],
      contactEmail: "flow@example.test",
    });
    expect(
      (
        await json<{ categoryIds: string[] }>(
          "/me/publisher-profile",
          organiser,
        )
      ).categoryIds,
    ).toEqual([categoryId]);
    const document = await upload(organiser, "VERIFICATION_DOC");
    const verification = await json<{ status: string }>(
      `/organisations/${created.id}/business-verification`,
      organiser,
      "POST",
      {
        legalName: "Flow test organisation",
        registrationNumber: "DEMO-ONLY",
        taxId: "123456789",
        representativeName: "Synthetic Representative",
        paymentWebsite: "https://example.test",
        documentKey: document.key,
      },
    );
    expect(verification.status).toBe("PENDING");
    const listed = await json<{
      items: { id: string; organizationName: string }[];
    }>("/admin/users", admin);
    expect(
      listed.items.find((row: { id: string }) => row.id === organiserId)
        ?.organizationName,
    ).toBe("Flow test organisation");
  });
});
