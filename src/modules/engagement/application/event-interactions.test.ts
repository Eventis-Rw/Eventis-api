import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import type { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import { EngagementRepository } from "../infrastructure/engagement.repository.js";

import { EngagementService } from "./engagement.service.js";

describe("event post interactions", () => {
  it("returns persisted like state and counts for the current viewer", async () => {
    const repository = {
      eventExists: () => Promise.resolve(true),
      eventInteractionSummary: () => Promise.resolve({ eventId: "event-1", likeCount: 12, commentCount: 3, liked: true }),
    } as unknown as EngagementRepository;
    const service = new EngagementService(repository, new FixedClock(new Date("2026-11-24T00:00:00Z")));
    await expect(service.eventInteractionSummary("event-1", "user-1")).resolves.toEqual({ eventId: "event-1", likeCount: 12, commentCount: 3, liked: true });
  });

  it("trims and returns newly created comments with the author's profile", async () => {
    const repository = {
      createEventComment: (_eventId: string, _userId: string, body: string) => Promise.resolve({
        id: "comment-1", eventId: "event-1", userId: "user-1", body,
        createdAt: new Date("2026-11-24T00:00:00Z"),
        user: { id: "user-1", username: "aline", displayName: "Aline", avatarUrl: "https://example.com/a.png" },
      }),
    } as unknown as EngagementRepository;
    const service = new EngagementService(repository, new FixedClock(new Date("2026-11-24T00:00:00Z")));
    await expect(service.createEventComment("event-1", "user-1", "  Great event!  ")).resolves.toMatchObject({
      id: "comment-1", body: "Great event!", user: { username: "aline", avatarUrl: "https://example.com/a.png" },
    });
  });

  it("allows only the comment author or post owner to delete comments", async () => {
    const repository = { deleteEventComment: () => Promise.resolve("forbidden" as const) } as unknown as EngagementRepository;
    const service = new EngagementService(repository, new FixedClock(new Date("2026-11-24T00:00:00Z")));
    await expect(service.deleteEventComment("comment-1", "other-user")).rejects.toMatchObject({ status: 403 });
  });

  it("trims edits and returns the updated comment", async () => {
    let updatedBody = "";
    const repository = {
      updateEventComment: (_id: string, _userId: string, body: string) => {
        updatedBody = body;
        return Promise.resolve({
          id: "comment-1", eventId: "event-1", userId: "user-1", body,
          createdAt: new Date("2026-11-24T00:00:00Z"),
          user: { id: "user-1", username: "aline", displayName: "Aline", avatarUrl: null },
        });
      },
    } as unknown as EngagementRepository;
    const service = new EngagementService(repository, new FixedClock(new Date()));
    expect(await service.updateEventComment("comment-1", "user-1", "  Updated  ")).toMatchObject({ body: "Updated" });
    expect(updatedBody).toBe("Updated");
  });

  it("reports forbidden and missing edits", async () => {
    for (const [result, status] of [["forbidden", 403], ["missing", 404]] as const) {
      const repository = { updateEventComment: () => Promise.resolve(result) } as unknown as EngagementRepository;
      const service = new EngagementService(repository, new FixedClock(new Date()));
      const error: unknown = await service.updateEventComment("comment-1", "user-2", "edit").then(() => null, (cause: unknown) => cause);
      expect(error).toMatchObject({ status });
    }
  });

  it("only updates an author's non-deleted comment", async () => {
    const calls: unknown[] = [];
    const prisma = {
      eventComment: {
        updateMany: (args: unknown) => { calls.push(args); return Promise.resolve({ count: 1 }); },
        findFirst: () => Promise.resolve({ id: "comment-1", body: "Updated" }),
      },
    } as unknown as PrismaService;
    const repository = new EngagementRepository(prisma);
    expect(await repository.updateEventComment("comment-1", "user-1", "Updated")).toMatchObject({ id: "comment-1", body: "Updated" });
    expect(calls).toEqual([{ where: { id: "comment-1", userId: "user-1", deletedAt: null }, data: { body: "Updated" } }]);
  });

  it("distinguishes another author's comment from a deleted or missing comment", async () => {
    for (const [record, result] of [[{ deletedAt: null }, "forbidden"], [{ deletedAt: new Date() }, "missing"], [null, "missing"]] as const) {
      const prisma = { eventComment: {
        updateMany: () => Promise.resolve({ count: 0 }),
        findUnique: () => Promise.resolve(record),
      } } as unknown as PrismaService;
      expect(await new EngagementRepository(prisma).updateEventComment("comment-1", "user-2", "edit")).toBe(result);
    }
  });
});
