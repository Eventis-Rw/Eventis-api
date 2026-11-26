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
      poster: { ownedOrganisations: [] as {name: string; logoKey: string}[], avatarUrl: "https://example.org/member.jpg", displayName: "Account holder", username: "publisher", firstName: null, lastName: null } };
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
      poster: { ownedOrganisations: [] as {name: string; logoKey: string}[], avatarUrl: "https://example.org/member.jpg", displayName: "Jane Doe", username: "jane", firstName: "Jane", lastName: "Doe" } };
    const repo = new EventRepository({ event: { findUnique: () => Promise.resolve(row) } } as unknown as PrismaService);
    expect(toEventResponse((await repo.findById(sample.eventId))!).organizer_name).toBe("Jane Doe");
    row.poster.displayName = "";
    expect((await repo.findById(sample.eventId))!.organizerName).toBe("jane");
    row.poster.username = "";
    expect((await repo.findById(sample.eventId))!.organizerName).toBe("Jane Doe");
    row.poster.ownedOrganisations.push({ name: "Kigali Universe", logoKey: "https://example.org/logo.jpg" });
    const legacy = toEventResponse((await repo.findById(sample.eventId))!);
    expect(legacy.organizer_name).toBe("Kigali Universe");
    expect(legacy.organizer_avatar_url).toBe("https://example.org/logo.jpg");
  });
});

const baseRow = {
  eventId: "00000000-0000-0000-0000-000000000000",
  title: "Sample",
  description: null,
  coverImage: null,
  category: null,
  categoryId: null,
  location: "Kigali",
  city: null,
  latitude: null,
  longitude: null,
  startDate: new Date("2027-01-01"),
  time: "10:00",
  endDate: null,
  endTime: null,
  timezone: "Africa/Kigali",
  status: "published",
  capacity: null,
  isPaid: false,
  priceMinor: null,
  currency: "RWF",
  bookingUrl: null,
  instructions: null,
  tags: [],
  ratingAvg: 0,
  reviewCount: 0,
  viewsCount: 0,
  posterId: "00000000-0000-0000-0000-000000000001",
  organisationId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  _count: { savedBy: 0 },
};

describe("EventRepository.list", () => {
  it("orders by newest posted first (created_at desc), with a deterministic tiebreak", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const prisma = {
      event: {
        findMany: (args: Record<string, unknown>) => {
          capturedArgs = args;
          return Promise.resolve([baseRow]);
        },
        count: () => Promise.resolve(1),
      },
    } as unknown as PrismaService;

    const repository = new EventRepository(prisma);
    await repository.list({ page: 1, limit: 20 });

    // A regression here (e.g. sorting by startDate instead of createdAt)
    // would silently bury newly posted events behind older ones with a
    // closer start date — this guards the exact bug class this was built to catch.
    expect(capturedArgs?.orderBy).toEqual([{ createdAt: "desc" }, { eventId: "asc" }]);
  });
});
