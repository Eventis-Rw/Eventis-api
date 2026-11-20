import { describe, expect, it } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { EngagementRepository } from "../infrastructure/engagement.repository.js";

import { EngagementService } from "./engagement.service.js";

describe("saved event reminders", () => {
  it("looks for events three calendar days ahead", async () => {
    const clock = new FixedClock(new Date("2026-11-17T09:30:00.000Z"));
    let requestedDate: Date | undefined;
    const repository = {
      createSavedEventReminders: (date: Date) => {
        requestedDate = date;
        return Promise.resolve(1);
      },
    } as unknown as EngagementRepository;
    const service = new EngagementService(repository, clock);

    const count = await service.createUpcomingEventReminders();
    expect(count).toBe(1);
    expect(requestedDate?.toISOString()).toBe("2026-11-20T09:30:00.000Z");
  });

  it("uses a stable per-user and per-event key to prevent duplicate reminders", async () => {
    const savedEvent = {
      userId: "user-1",
      eventId: "event-1",
      event: { title: "Jazz Night", startDate: new Date("2026-11-20"), location: "Kigali" },
    };
    let createInput: unknown;
    const repository = new EngagementRepository({
      savedEvent: { findMany: () => Promise.resolve([savedEvent]) },
      notification: {
        createMany: (input: unknown) => {
          createInput = input;
          return Promise.resolve({ count: 1 });
        },
      },
    } as never);

    const created = await repository.createSavedEventReminders(
      new Date("2026-11-17T09:00:00.000Z"),
    );
    expect(created).toBe(1);
    expect(createInput).toMatchObject({
      skipDuplicates: true,
      data: [{ userId: "user-1", dedupeKey: "saved-event-reminder:event-1" }],
    });
  });
});
