import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { describe, expect, test } from "bun:test";

import type { PrismaService } from "../../src/infrastructure/database/prisma.service.js";
import { EventInstallmentRepository } from "../../src/modules/event-installments/infrastructure/installment.repository.js";
import { EventRepository } from "../../src/modules/events/infrastructure/event.repository.js";
import { FindLoveChatRepository } from "../../src/modules/findlove/infrastructure/findlove-chat.repository.js";
import { SettingsRepository } from "../../src/modules/settings/infrastructure/settings.repository.js";

const databaseUrl = process.env.EFFICIENCY_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("feed, inbox and installment queries", () => {
  test("returns viewer-specific counts, ordered previews, and scoped pages", async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl! });
    const rollback = new Error("rollback fixtures");
    try {
      await prisma.$transaction(
        async (tx) => {
          const db = tx as unknown as PrismaService;
          const me = await tx.user.create({ data: {} });
          const other = await tx.user.create({ data: {} });
          const category = randomUUID();
          const startDate = new Date("2026-11-26T00:00:00Z");
          const fields = {
            title: "Concert",
            time: "12:00",
            location: "Kigali",
            startDate,
            category,
            status: "published" as const,
          };
          const event = await tx.event.create({
            data: { ...fields, posterId: me.id },
          });
          const old = new Date("2026-11-20T00:00:00Z");
          await tx.event.createMany({
            data: [
              { ...fields, posterId: other.id, startDate: old },
              {
                ...fields,
                posterId: other.id,
                startDate: old,
                endDate: startDate,
              },
              { ...fields, posterId: other.id, status: "draft" },
            ],
          });
          await tx.eventLike.create({
            data: { eventId: event.eventId, userId: me.id },
          });
          await tx.eventComment.createMany({
            data: [
              { eventId: event.eventId, userId: me.id, body: "Hello" },
              {
                eventId: event.eventId,
                userId: other.id,
                body: "Removed",
                deletedAt: old,
              },
            ],
          });
          const events = new EventRepository(db);
          const page = {
            page: 1,
            limit: 12,
            category,
            activeSince: "2026-11-25",
            status: "published" as const,
          };
          const result = await events.list({ ...page, viewerId: me.id });
          expect(result.total).toBe(2);
          expect(
            result.items.find((row) => row.eventId === event.eventId)
              ?.interactions,
          ).toEqual({ liked: true, likeCount: 1, commentCount: 1 });
          expect(
            (await events.list(page)).items.find(
              (row) => row.eventId === event.eventId,
            )?.interactions?.liked,
          ).toBe(false);

          const amounts = {
            totalAmountMinor: 100n,
            initialPaymentMinor: 0n,
            interestAmountMinor: 0n,
            totalPayableMinor: 100n,
            outstandingBalanceMinor: 100n,
            frequency: "WEEKLY" as const,
            installmentCount: 1,
            startDate,
          };
          await tx.eventInstallmentAgreement.createMany({
            data: [
              { ...amounts, customerId: other.id, createdAt: startDate },
              { ...amounts, customerId: me.id, createdAt: old },
              {
                ...amounts,
                customerId: other.id,
                eventId: event.eventId,
                createdAt: old,
              },
            ],
          });
          const uncategorized = await tx.event.create({ data: { ...fields, category: null, posterId: me.id } });
          const fallback = await events.list({ ...page, category: undefined, excludeCategories: [category.toUpperCase()] });
          expect(fallback.items.map(item => item.eventId)).toContain(uncategorized.eventId);
          expect(fallback.items.map(item => item.eventId)).not.toContain(event.eventId);

          const agreements = new EventInstallmentRepository(db);
          const first = await agreements.listAgreements({
            visibleTo: me.id,
            page: 1,
            limit: 1,
          });
          const second = await agreements.listAgreements({
            visibleTo: me.id,
            page: 2,
            limit: 1,
          });
          expect(first.total).toBe(2);
          expect(second.total).toBe(2);
          expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
          expect(
            [first.items[0]?.customerId, second.items[0]?.customerId].sort(),
          ).toEqual([me.id, other.id].sort());

          const chatIds = Array.from({ length: 100 }, () => randomUUID());
          await tx.conversation.createMany({
            data: chatIds.map((id) => ({ id, service: "FINDLOVE" })),
          });
          await tx.conversationParticipant.createMany({
            data: chatIds.map((conversationId) => ({
              conversationId,
              userId: me.id,
              lastReadAt: old,
            })),
          });
          const conversationId = chatIds[0]!;
          const message = { conversationId, senderId: other.id };
          await tx.message.createMany({
            data: [
              { ...message, content: "already read", createdAt: old },
              { ...message, content: "first", createdAt: startDate },
              {
                ...message,
                content: "reply",
                senderId: me.id,
                createdAt: new Date(+startDate + 1000),
              },
              {
                ...message,
                content: "deleted",
                createdAt: new Date(+startDate + 2000),
                deletedAt: startDate,
              },
            ],
          });
          const chats = new FindLoveChatRepository(db);
          const summaries = await chats.summaries(chatIds, me.id);
          expect(summaries.size).toBe(100);
          expect(summaries.get(conversationId)?.unreadCount).toBe(1);
          expect(
            summaries.get(conversationId)?.messages.map((m) => m.content),
          ).toEqual(["first", "reply"]);
          expect(summaries.get(chatIds[1]!)?.messages).toEqual([]);
          expect((await chats.summaries(chatIds, other.id)).size).toBe(0);

          const notice = {
            userId: me.id,
            type: "TEST",
            title: "Test",
            body: "Test",
          };
          await tx.notification.createMany({
            data: [
              { ...notice, category: "ACTIVITY" },
              { ...notice, category: "ACTIVITY" },
              { ...notice, category: "EVENTS", readAt: old },
              { ...notice, category: "FINDLOVE" },
            ],
          });
          const response = await new SettingsRepository(db).listNotifications({
            userId: me.id,
            skip: 0,
            take: 1,
            unreadOnly: false,
          });
          expect(response.items.length).toBe(1);
          expect(response.total).toBe(3);
          expect(response.unreadCount).toBe(2);
          throw rollback;
        },
        { timeout: 15000 },
      );
      throw new Error("Expected test transaction to roll back");
    } catch (error) {
      expect(error).toBe(rollback);
    } finally {
      await prisma.$disconnect();
    }
  });
});
