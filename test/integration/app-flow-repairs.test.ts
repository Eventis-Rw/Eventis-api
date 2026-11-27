import { randomInt, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import { loadEnv } from "../../src/config/env.js";
import { StorageService } from "../../src/infrastructure/storage/storage.service.js";
import type { MembershipSnapshot } from "../../src/modules/findlove/infrastructure/admin-membership.repository.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";

const suite =
  process.env.RUN_FLOW_INTEGRATION === "1" ? describe : describe.skip;
suite("repairs to the demonstrated application flows", () => {
  const db = new PrismaClient();
  const base = process.env.FLOW_API_URL ?? "http://127.0.0.1:4100/api/v1";
  const users: string[] = [];
  const uploadedKeys: string[] = [];
  let admin: string,
    member: string,
    memberId: string,
    organiser: string,
    organiserId: string;
  let verificationId: string, manualId: string, planId: string, roleId: string, methodId: string;
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
      token: role === "ADMIN"
        ? (await tokens.issueAccessToken({ sub: user.id, roles: ["admin"] })).token
        : (
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
    const result = await response.json() as { id: string; key: string };
    uploadedKeys.push(result.key);
    return result;
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
    methodId = (await db.manualPaymentMethod.create({
      data: { provider: "MTN_MOMO", platform: "ORGANISER", phoneNumber: "+250788000000" },
    })).id;
  });
  afterAll(async () => {
    if (users.length) {
      await db.organiserApplication.deleteMany({ where: { userId: { in: users } } });
      await db.manualPaymentSubmission.deleteMany({
        where: { userId: { in: users } },
      });
      await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    if (planId) await db.organiserPlan.deleteMany({ where: { id: planId } });
    if (roleId) await db.consoleRole.deleteMany({ where: { id: roleId } });
    if (methodId) await db.manualPaymentMethod.deleteMany({ where: { id: methodId } });
    const storage = new StorageService(loadEnv(), new SystemClock());
    for (const key of uploadedKeys) await storage.deleteFile(key);
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
    const submitted = await json<{
      termsVersion: string | null;
      termsAcceptedAt: string | null;
    }>("/findlove/age-verification", member, "POST", {
      documentType: "PASSPORT",
      frontKey: document.key,
      adultConfirmed: true,
      dateOfBirth: "1998-03-15",
      termsVersion: "2026-11-draft",
    });
    expect(submitted.termsVersion).toBe("2026-11-draft");
    expect(submitted.termsAcceptedAt).toEqual(expect.any(String));
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
  it("verifies payment separately from organiser approval and preserves purchased terms", async () => {
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
    const application = await json<{ id: string; status: string }>("/organiser-applications", organiser, "POST", {
      name: "Flow application",
      description: "Local synthetic organiser application for regression verification.",
      activities: "Community music",
      location: "Kigali",
    });
    expect(application.status).toBe("PENDING_PAYMENT");
    expect((await request("/organiser-applications", organiser, "POST", {
      name: "Duplicate application", description: "A duplicate must not be accepted.",
      activities: "Events", location: "Kigali",
    })).status).toBe(409);
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
    const listedPayments = await json<{
      items: { id: string; reference: string; status: string; user: { id: string } }[];
      total: number;
    }>("/admin/manual-payments?platform=organiser&page=1&limit=10", admin);
    expect(listedPayments.total).toBeGreaterThanOrEqual(1);
    expect(listedPayments.items).toContainEqual(
      expect.objectContaining({
        id: payment.id,
        reference: payment.reference,
        status: "pending",
        user: expect.objectContaining({ id: organiserId }),
      }),
    );
    expect((await request("/admin/manual-payments?platform=organiser", organiser)).status).toBe(403);
    await db.organiserPlan.update({
      where: { id: plan.id },
      data: {
        active: false,
        durationDays: 20,
        postQuota: 99,
        priceMinor: 50000n,
      },
    });
    const transactionId = `FLOW-${randomUUID()}`;
    expect((await request(`/admin/manual-payments/${payment.id}/approve`, admin, "POST", {})).status).toBe(422);
    await json(`/admin/manual-payments/${payment.id}/approve`, admin, "POST", { verified_transaction_id: transactionId });
    await json(`/admin/manual-payments/${payment.id}/approve`, admin, "POST", { verified_transaction_id: transactionId });
    expect(
      (
        await db.manualPaymentSubmission.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
    ).toBe("APPROVED");
    expect((await json<{ application: { status: string } }>("/me/organiser-application", organiser)).application.status).toBe("IN_REVIEW");
    expect((await db.user.findUniqueOrThrow({ where: { id: organiserId } })).accountType).toBe("CUSTOMER");
    expect((await request("/organisations", organiser, "POST", {})).status).toBe(403);
    expect((await request("/events", organiser, "POST", {})).status).toBe(403);
    expect((await request("/users/me", organiser, "PATCH", { accountType: "POSTER" })).status).toBe(403);
    expect((await request(`/admin/organiser-applications/${application.id}/review`, organiser, "POST", { status: "APPROVED" })).status).toBe(403);
    await json(`/admin/organiser-applications/${application.id}/review`, admin, "POST", { status: "APPROVED" });
    expect((await db.user.findUniqueOrThrow({ where: { id: organiserId } })).accountType).toBe("POSTER");
    expect((await json<{ roles: string[] }>("/auth/me", organiser)).roles).toContain("organizer_owner");
    expect((await db.notification.findMany({ where: { userId: organiserId }, select: { type: true } })).map((row) => row.type)).toContain("organiser_application_approved");
    const subscription = await db.organiserSubscription.findFirstOrThrow({
      where: { userId: organiserId },
    });
    expect(subscription.postsRemaining).toBe(5);
    expect(
      subscription.expiresAt!.getTime() - subscription.startsAt!.getTime(),
    ).toBe(10 * 86400000);
    await db.organiserPlan.update({ where: { id: plan.id }, data: { active: true } });
    expect(
      (
        await json<{ items: { id: string }[] }>(
          "/admin/organiser-subscriptions",
          admin,
        )
      ).items.some((row: { id: string }) => row.id === subscription.id),
    ).toBe(true);
  });
  it("keeps an unverified payment out of review and permits a fresh application after rejection", async () => {
    const applicant = await identity();
    const form = {
      name: "Reapplication test",
      description: "Local synthetic organiser application for regression verification.",
      activities: "Community events",
      location: "Kigali",
    };
    const application = await json<{ id: string }>("/organiser-applications", applicant.token, "POST", form);
    const method = (await json<{ items: { id: string }[] }>("/manual-payments/methods?platform=organiser", applicant.token)).items[0]!;
    const receipt = await upload(applicant.token, "PAYMENT_RECEIPT");
    const payment = await json<{ id: string }>("/manual-payments", applicant.token, "POST", {
      platform: "organiser", organiser_plan_id: planId, payment_method_id: method.id, receipt_upload_id: receipt.id,
    });
    await json(`/admin/manual-payments/${payment.id}/reject`, admin, "POST", { rejection_reason: "Receipt could not be verified" });
    expect((await json<{ application: { status: string } }>("/me/organiser-application", applicant.token)).application.status).toBe("PENDING_PAYMENT");
    expect((await db.user.findUniqueOrThrow({ where: { id: applicant.id } })).accountType).toBe("CUSTOMER");
    const newReceipt = await upload(applicant.token, "PAYMENT_RECEIPT");
    const second = await json<{ id: string }>("/manual-payments", applicant.token, "POST", {
      platform: "organiser", organiser_plan_id: planId, payment_method_id: method.id, receipt_upload_id: newReceipt.id,
    });
    const transactionId = `FLOW-${randomUUID()}`;
    await json(`/admin/manual-payments/${second.id}/approve`, admin, "POST", { verified_transaction_id: transactionId });
    await json(`/admin/organiser-applications/${application.id}/review`, admin, "POST", { status: "REJECTED", rejectionReason: "Additional information needed" });
    expect((await json<{ application: { status: string; rejectionReason: string } }>("/me/organiser-application", applicant.token)).application).toMatchObject({
      status: "REJECTED", rejectionReason: "Additional information needed",
    });
    expect((await db.notification.findMany({ where: { userId: applicant.id }, select: { type: true } })).map((row) => row.type)).toContain("organiser_application_rejected");
    expect((await request("/events", applicant.token, "POST", {})).status).toBe(403);
    const reapplied = await json<{ id: string; status: string; manualPaymentId: string | null }>("/organiser-applications", applicant.token, "POST", form);
    expect(reapplied.id).not.toBe(application.id);
    expect(reapplied).toMatchObject({ status: "PENDING_PAYMENT", manualPaymentId: null });
    const thirdReceipt = await upload(applicant.token, "PAYMENT_RECEIPT");
    const third = await json<{ id: string }>("/manual-payments", applicant.token, "POST", {
      platform: "organiser", organiser_plan_id: planId, payment_method_id: method.id, receipt_upload_id: thirdReceipt.id,
    });
    expect((await request(`/admin/manual-payments/${third.id}/approve`, admin, "POST", { verified_transaction_id: transactionId })).status).toBe(409);
    expect((await json<{ application: { status: string } }>("/me/organiser-application", applicant.token)).application.status).toBe("PENDING_PAYMENT");
  });
  it("prevents concurrent reuse of a provider transaction", async () => {
    const accounts = await Promise.all([identity(), identity()]);
    const method = (await json<{ items: { id: string }[] }>("/manual-payments/methods?platform=organiser", accounts[0]!.token)).items[0]!;
    const payments = await Promise.all(accounts.map(async (account) => {
      await json("/organiser-applications", account.token, "POST", {
        name: "Concurrent test", description: "Synthetic organiser for concurrency testing.",
        activities: "Community events", location: "Kigali",
      });
      const receipt = await upload(account.token, "PAYMENT_RECEIPT");
      return json<{ id: string }>("/manual-payments", account.token, "POST", {
        platform: "organiser", organiser_plan_id: planId, payment_method_id: method.id, receipt_upload_id: receipt.id,
      });
    }));
    const transactionId = `FLOW-${randomUUID()}`;
    const results = await Promise.all(payments.map((payment) =>
      request(`/admin/manual-payments/${payment.id}/approve`, admin, "POST", { verified_transaction_id: transactionId }),
    ));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it("preserves existing organiser access for plan renewals", async () => {
    const existing = await identity();
    await db.user.update({ where: { id: existing.id }, data: { accountType: "POSTER" } });
    const method = (await json<{ items: { id: string }[] }>("/manual-payments/methods?platform=organiser", existing.token)).items[0]!;
    const receipt = await upload(existing.token, "PAYMENT_RECEIPT");
    const payment = await json<{ id: string }>("/manual-payments", existing.token, "POST", {
      platform: "organiser", organiser_plan_id: planId, payment_method_id: method.id, receipt_upload_id: receipt.id,
    });
    await json(`/admin/manual-payments/${payment.id}/approve`, admin, "POST", { verified_transaction_id: `FLOW-${randomUUID()}` });
    expect((await db.organiserSubscription.findFirstOrThrow({ where: { userId: existing.id } })).status).toBe("ACTIVE");
    expect((await db.user.findUniqueOrThrow({ where: { id: existing.id } })).accountType).toBe("POSTER");
  });

  it("links a receipt submitted before rollout only after the applicant completes the form", async () => {
    const applicant = await identity();
    const receipt = await upload(applicant.token, "PAYMENT_RECEIPT");
    const oldPayment = await db.manualPaymentSubmission.create({
      data: {
        reference: `FLOW-${randomUUID().slice(0, 20)}`, userId: applicant.id, platform: "ORGANISER",
        organiserPlanId: planId, planSnapshot: { name: "Old plan", durationDays: 10, postQuota: 5 },
        amountMinor: 10000n, currency: "RWF", paymentMethodId: methodId,
        paymentMethodSnapshot: { provider: "MTN_MOMO", accountName: null, phoneNumber: "+250788000000" },
        receiptUploadId: receipt.id,
      },
    });
    const transactionId = `FLOW-${randomUUID()}`;
    expect((await request(`/admin/manual-payments/${oldPayment.id}/approve`, admin, "POST", { verified_transaction_id: transactionId })).status).toBe(409);
    const application = await json<{ manualPaymentId: string }>("/organiser-applications", applicant.token, "POST", {
      name: "Existing receipt", description: "Application completed after an earlier receipt submission.",
      activities: "Community events", location: "Kigali",
    });
    expect(application.manualPaymentId).toBe(oldPayment.id);
    await json(`/admin/manual-payments/${oldPayment.id}/approve`, admin, "POST", { verified_transaction_id: transactionId });
    expect((await json<{ application: { status: string } }>("/me/organiser-application", applicant.token)).application.status).toBe("IN_REVIEW");
    expect((await db.user.findUniqueOrThrow({ where: { id: applicant.id } })).accountType).toBe("CUSTOMER");
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
    expect(list.items.some((item) => item.id === created.id)).toBe(true);
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
