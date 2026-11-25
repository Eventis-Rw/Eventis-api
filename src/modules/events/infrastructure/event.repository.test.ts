import { describe, expect, it } from "bun:test";

import type { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { Event } from "../domain/event.js";
import { toEventResponse } from "../mappers/event.mapper.js";

import { EventRepository } from "./event.repository.js";

const sample: Event = {
  eventId: "00000000-0000-4000-8000-000000000001",
  title: "Kigali Jazz Night",
  description: null,
  coverImage: null,
  category: "music",
  categoryId: null,
  city: null,
  latitude: null,
  longitude: null,
  endDate: null,
  endTime: null,
  timezone: "Africa/Kigali",
  capacity: null,
  isPaid: false,
  priceMinor: null,
  currency: "RWF",
  bookingUrl: null,
  instructions: null,
  tags: [],
  organisationId: null,
  ratingAvg: 0,
  reviewCount: 0,
  location: "Kigali",
  startDate: new Date("2026-10-15T00:00:00.000Z"),
  time: "18:00",
  status: "draft",
  viewsCount: 0,
  savesCount: 0,
  posterId: "publisher",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

describe("event organiser identity", () => {
  it("returns the organisation name on feed, detail and update responses", async () => {
    const row = { ...sample, _count: { savedBy: 0 }, organisation: { name: "Kigali Arts" },
      poster: { displayName: "Account holder", username: "publisher", firstName: null, lastName: null } };
    const db = { event: {
      findMany: () => Promise.resolve([row]), count: () => Promise.resolve(1),
      findUnique: () => Promise.resolve(row), update: () => Promise.resolve(row),
    } } as unknown as PrismaService;
    const repo = new EventRepository(db);
    const feed = await repo.list({ page: 1, limit: 10 });
    expect(toEventResponse(feed.items[0]!).organizer_name).toBe("Kigali Arts");
    expect(toEventResponse((await repo.findById(sample.eventId))!).organizer_name).toBe("Kigali Arts");
    row.organisation.name = "Updated organiser";
    expect(toEventResponse((await repo.findById(sample.eventId))!).organizer_name).toBe("Updated organiser");
  });

  it("uses the publisher name for events without an organisation", async () => {
    const row = { ...sample, _count: { savedBy: 0 }, organisation: null,
      poster: { displayName: "Jane Doe", username: "jane", firstName: "Jane", lastName: "Doe" } };
    const repo = new EventRepository({ event: { findUnique: () => Promise.resolve(row) } } as unknown as PrismaService);
    expect(toEventResponse((await repo.findById(sample.eventId))!).organizer_name).toBe("Jane Doe");
    row.poster.displayName = "";
    expect((await repo.findById(sample.eventId))!.organizerName).toBe("jane");
    row.poster.username = "";
    expect((await repo.findById(sample.eventId))!.organizerName).toBe("Jane Doe");
  });
});
