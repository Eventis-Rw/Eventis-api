import { describe, expect, it } from "bun:test";

import type { Event } from "../domain/event.js";
import type { EventRepository } from "../infrastructure/event.repository.js";

import { ShareEventService } from "./share-event.service.js";

const eventId = "00000000-0000-4000-8000-000000000001";
const publishedEvent: Event = {
  eventId,
  title: "Kigali Jazz Night",
  description: "Private details are not part of the share response",
  coverImage: "events/cover.jpg",
  category: "music",
  location: "Kigali",
  startDate: new Date("2026-10-15T00:00:00.000Z"),
  time: "18:00",
  status: "published",
  viewsCount: 12,
  posterId: "00000000-0000-4000-8000-000000000002",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

function serviceFor(event: Event | null): ShareEventService {
  const repository = {
    findById: () => Promise.resolve(event),
  } as unknown as EventRepository;

  return new ShareEventService(repository, { MOBILE_APP_SCHEME: "mobile" });
}

describe("ShareEventService", () => {
  it("generates the existing mobile deep link for a published event", async () => {
    const result = await serviceFor(publishedEvent).execute(eventId);

    expect(result).toEqual({
      event_id: eventId,
      share_url: `mobile://event/${eventId}`,
    });
    expect(Object.keys(result).sort()).toEqual(["event_id", "share_url"]);
  });

  it("rejects malformed event IDs as validation errors", () =>
    expect(serviceFor(publishedEvent).execute("not-an-id")).rejects.toMatchObject({
      status: 422,
    }),
  );

  it("does not create share data for missing or deleted events", () =>
    expect(serviceFor(null).execute(eventId)).rejects.toMatchObject({
      status: 404,
    }),
  );

  it("does not share unpublished events", () => {
    const draft = { ...publishedEvent, status: "draft" as const };

    return expect(serviceFor(draft).execute(eventId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
