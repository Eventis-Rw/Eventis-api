import { describe, expect, it } from "bun:test";

import type { Event } from "../domain/event.js";
import type { EventRepository } from "../infrastructure/event.repository.js";

import { GetEventService } from "./get-event.service.js";

const ownerId = "00000000-0000-4000-8000-000000000002";
const sample: Event = {
  eventId: "00000000-0000-4000-8000-000000000001",
  title: "Kigali Jazz Night",
  description: null,
  coverImage: null,
  category: "music",
  location: "Kigali",
  startDate: new Date("2026-10-15T00:00:00.000Z"),
  time: "18:00",
  status: "draft",
  viewsCount: 0,
  posterId: ownerId,
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

function serviceFor(event: Event | null) {
  let increments = 0;
  const repository = {
    findById: () => Promise.resolve(event),
    incrementViews: () => {
      increments += 1;
      return Promise.resolve({ ...event!, viewsCount: event!.viewsCount + 1 });
    },
  } as unknown as EventRepository;
  return { service: new GetEventService(repository), increments: () => increments };
}

describe("GetEventService", () => {
  it("allows the creator to view a draft without counting a public view", async () => {
    const { service, increments } = serviceFor(sample);

    const result = await service.execute(sample.eventId, ownerId);
    expect(result).toEqual(sample);
    expect(increments()).toBe(0);
  });

  it("hides non-public events from other viewers", async () => {
    const { service } = serviceFor({ ...sample, status: "cancelled" });

    const error = await captureError(service.execute(sample.eventId, "another-user"));
    expect(error).toMatchObject({ status: 404 });
  });

  it("increments views for published events", async () => {
    const { service, increments } = serviceFor({ ...sample, status: "published" });

    const result = await service.execute(sample.eventId);
    expect(result).toMatchObject({ viewsCount: 1 });
    expect(increments()).toBe(1);
  });
});

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}
