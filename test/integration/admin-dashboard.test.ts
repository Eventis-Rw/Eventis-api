import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { SystemClock } from "../../src/common/clock.js";
import { loadEnv } from "../../src/config/env.js";
import type { AdminDashboardRepository } from "../../src/modules/admin-dashboard/infrastructure/admin-dashboard.repository.js";
import { TokenService } from "../../src/modules/identity/infrastructure/token.service.js";
const suite =
  process.env.RUN_ADMIN_INTEGRATION === "1" ? describe : describe.skip;
suite("admin operational screens", () => {
  const db = new PrismaClient(),
    base = "http://127.0.0.1:4001/api/v1";
  let admin: string,
    customer: string,
    adminId: string,
    customerId: string,
    ticketId: string,
    photoId: string;
  const call = (path: string, method = "GET", body?: unknown, token = admin) =>
    fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    for (const [phone, role] of [
      ["+250788100041", "ADMIN"],
      ["+250788100042", "CUSTOMER"],
    ] as const) {
      const user = await db.user.upsert({
        where: { phone },
        create: {
          phone,
          role,
          status: "ACTIVE",
          pinHash: tokens.hashPin("12345"),
          displayName: role === "ADMIN" ? "Real administrator" : "Real member",
        },
        update: {
          role,
          status: "ACTIVE",
          deletedAt: null,
          pinHash: tokens.hashPin("12345"),
        },
      });
      const profile = await db.loveProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          username: "ops_" + phone.slice(-4),
          gender: "MAN",
          interestedIn: "EVERYONE",
          dateOfBirth: new Date("1995-01-01"),
          country: "Rwanda",
          city: "Kigali",
          neighborhood: "Kiyovu",
        },
        update: {},
      });
      const session = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin: "12345" }),
      });
      expect(session.ok).toBe(true);
      const result = (await session.json()) as {
        tokens: { accessToken: string };
      };
      if (role === "ADMIN") {
        admin = result.tokens.accessToken;
        adminId = user.id;
      } else {
        customer = result.tokens.accessToken;
        customerId = user.id;
        photoId = (
          await db.loveProfilePhoto.create({
            data: {
              profileId: profile.id,
              key: "integration/photo.jpg",
              position: 0,
              isPrimary: true,
            },
          })
        ).id;
        ticketId = (
          await db.supportReport.create({
            data: {
              userId: user.id,
              category: "PAYMENTS",
              description: "Please check my external payment receipt",
              contactEmail: "integration@example.test",
            },
          })
        ).id;
      }
    }
  });
  afterAll(() => db.$disconnect());
  it("requires admin authorization for every operational list", async () => {
    for (const path of ["photos", "support", "staff", "notifications"]) {
      expect(
        (await call("/admin/findlove/" + path, "GET", undefined, customer))
          .status,
      ).toBe(403);
      expect((await call("/admin/findlove/" + path)).status).toBe(200);
    }
  });
  it("persists moderation decisions and audits the actual reviewer", async () => {
    const listed = (await (
      await call("/admin/findlove/photos")
    ).json()) as Awaited<ReturnType<AdminDashboardRepository["photos"]>>;
    expect(listed.find((p: { id: string }) => p.id === photoId)!.status).toBe(
      "pending",
    );
    expect(
      (
        await call("/admin/findlove/photos/" + photoId, "PATCH", {
          status: "rejected",
          reason: "",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("/admin/findlove/photos/" + photoId, "PATCH", {
          status: "approved",
          reason: "Image reviewed",
        })
      ).status,
    ).toBe(200);
    const row = await db.loveProfilePhoto.findUniqueOrThrow({
      where: { id: photoId },
    });
    expect(row.moderationStatus).toBe("approved");
    expect(row.reviewedBy).toBe(adminId);
  });
  it("stores replies, keeps internal notes private, and retries a reply only once", async () => {
    const path = "/admin/findlove/support/" + ticketId;
    const reply = {
      reply: "We have located your payment receipt.",
      requestId: randomUUID(),
    };
    expect((await call(path, "POST", reply)).status).toBe(200);
    expect((await call(path, "POST", reply)).status).toBe(200);
    expect(
      await db.adminSupportMessage.count({
        where: { requestId: reply.requestId },
      }),
    ).toBe(1);
    const note = {
      note: "Private reconciliation note for the finance team.",
      requestId: randomUUID(),
    };
    expect((await call(path, "POST", note)).status).toBe(200);
    expect(
      (
        await call(path, "POST", {
          status: "resolved",
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(200);
    const tickets = (await (
        await call("/admin/findlove/support")
      ).json()) as Awaited<ReturnType<AdminDashboardRepository["support"]>>,
      ticket = tickets.find((t: { id: string }) => t.id === ticketId)!;
    expect(ticket.status).toBe("resolved");
    expect(ticket.messages.at(-1)!.senderName).toBe("Real administrator");
    expect(ticket.internalNotes.at(-1)!.note).toBe(note.note);
    const mine = await (
      await call("/me/support-reports", "GET", undefined, customer)
    ).text();
    expect(mine).not.toContain(note.note);
    expect(
      await db.notification.count({
        where: {
          userId: customerId,
          type: "support_reply",
          body: reply.reply,
          data: { path: ["supportReportId"], equals: ticketId },
        },
      }),
    ).toBe(1);
  });
  it("reports actual staff and saves test previews only to the current admin inbox", async () => {
    const staff = (await (
      await call("/admin/findlove/staff")
    ).json()) as Awaited<ReturnType<AdminDashboardRepository["staff"]>>;
    expect(staff.find((a: { id: string }) => a.id === adminId)!.name).toBe(
      "Real administrator",
    );
    const snapshot = (await (
      await call("/admin/findlove/notifications")
    ).json()) as Awaited<ReturnType<AdminDashboardRepository["notifications"]>>;
    expect(snapshot.templates.length).toBe(3);
    expect(snapshot.stats.deliveryRate).toBe("N/A");
    expect(
      (
        await call(
          "/admin/findlove/notifications/membership_expiry/preview",
          "POST",
        )
      ).status,
    ).toBe(200);
    expect(
      await db.notification.count({
        where: { userId: adminId, type: "admin_template_preview" },
      }),
    ).toBeGreaterThan(0);
  });
  it("loads and resolves actual event reports with an audit entry", async () => {
    const event = await db.event.create({
      data: {
        title: "Admin moderation integration",
        location: "Kigali",
        startDate: new Date("2026-12-01"),
        time: "12:00",
        posterId: customerId,
      },
    });
    const report = await db.eventReport.create({
      data: {
        eventId: event.eventId,
        reporterId: customerId,
        reason: "Incorrect venue",
        details: "Please confirm venue details",
      },
    });
    expect(
      (await call("/admin/reports", "GET", undefined, customer)).status,
    ).toBe(403);
    const list = (await (await call("/admin/reports")).json()) as {
      id: string;
      targetLabel: string;
    }[];
    expect(list.find((r) => r.id === report.id)!.targetLabel).toBe(event.title);
    expect(
      (
        await call("/admin/reports/" + report.id, "PATCH", {
          outcome: "resolved",
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.eventReport.findUniqueOrThrow({ where: { id: report.id } }))
        .reviewedBy,
    ).toBe(adminId);
    const audit = (await (await call("/admin/audit-logs")).json()) as {
      action: string;
      actorName: string;
    }[];
    expect(
      audit.some(
        (a) =>
          a.action === "eventis.admin.report" &&
          a.actorName === "Real administrator",
      ),
    ).toBe(true);
  });
  it("preserves organiser access while checking current account permissions", async () => {
    expect((await call("/organisations", "POST", {}, customer)).status).toBe(
      403,
    );
    try {
      await db.user.update({
        where: { id: customerId },
        data: { accountType: "POSTER" },
      });
      expect((await call("/organisations", "POST", {}, customer)).status).toBe(
        422,
      );
    } finally {
      await db.user.update({
        where: { id: customerId },
        data: { accountType: "CUSTOMER" },
      });
    }
  });
  it("revokes existing-token access immediately when an administrator is demoted or suspended", async () => {
    try {
      await db.user.update({
        where: { id: adminId },
        data: { role: "CUSTOMER" },
      });
      expect((await call("/admin/findlove/staff")).status).toBe(403);
      await db.user.update({
        where: { id: adminId },
        data: { role: "ADMIN", status: "INACTIVE" },
      });
      expect((await call("/admin/findlove/staff")).status).toBe(401);
    } finally {
      await db.user.update({
        where: { id: adminId },
        data: { role: "ADMIN", status: "ACTIVE" },
      });
    }
  });
});
