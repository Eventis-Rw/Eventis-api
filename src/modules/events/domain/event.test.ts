import { describe, expect, it } from "bun:test";

import {
  applyEventUpdate,
  assertValidTime,
  canTransition,
  createEvent,
  type Event,
} from "./event.js";

const base: Event = {
  eventId: "00000000-0000-4000-8000-000000000001",
  title: "Kigali Jazz Night",
  description: "Live jazz in Kimihurura",
  coverImage: null,
  category: "music",
  location: "KG 9 Ave, Kimihurura",
  startDate: new Date("2026-10-01T00:00:00.000Z"),
  time: "18:00",
  status: "draft",
  viewsCount: 0,
  posterId: "00000000-0000-4000-8000-000000000002",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

describe("assertValidTime", () => {
  it("rejects an invalid time string", () => {
    expect(() => assertValidTime("25:00")).toThrow(/HH:mm/);
  });
});

describe("canTransition", () => {
  it("allows draft → published and draft → cancelled", () => {
    expect(canTransition("draft", "published")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
  });

  it("rejects published → draft", () => {
    expect(canTransition("published", "draft")).toBe(false);
  });
});

describe("createEvent", () => {
  it("always starts as draft", () => {
    const created = createEvent(
      {
        title: "Tech Meetup",
        location: "Impact Hub, KN 5 Rd",
        startDate: new Date("2026-11-01T00:00:00Z"),
        time: "17:00",
        posterId: "00000000-0000-4000-8000-000000000002",
      },
      new Date("2026-09-29T08:00:00Z"),
    );
    expect(created.status).toBe("draft");
  });
});

describe("applyEventUpdate", () => {
  it("rejects an illegal status transition", () => {
    expect(() =>
      applyEventUpdate(
        { ...base, status: "cancelled" },
        { status: "published" },
      ),
    ).toThrow(/cannot transition/);
  });

  it("applies a title change on a draft", () => {
    const updated = applyEventUpdate(base, { title: "Updated title" });
    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe("draft");
  });
});
