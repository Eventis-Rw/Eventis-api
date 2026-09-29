import { describe, expect, it } from "bun:test";

import {
  applyEventUpdate,
  assertValidSchedule,
  canTransition,
  createEvent,
  type Event,
} from "./event.js";

const base: Event = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Kigali Jazz Night",
  description: "Live jazz in Kimihurura",
  status: "draft",
  startsAt: new Date("2026-10-01T18:00:00.000Z"),
  endsAt: new Date("2026-10-01T22:00:00.000Z"),
  venueName: "The Hut",
  address: "KG 9 Ave, Kimihurura",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

describe("assertValidSchedule", () => {
  it("rejects an end time that is not after the start", () => {
    expect(() =>
      assertValidSchedule(
        new Date("2026-10-01T18:00:00Z"),
        new Date("2026-10-01T18:00:00Z"),
      ),
    ).toThrow(/end after it starts/);
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
        startsAt: new Date("2026-11-01T17:00:00Z"),
        endsAt: new Date("2026-11-01T20:00:00Z"),
        venueName: "Impact Hub",
        address: "KN 5 Rd",
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
