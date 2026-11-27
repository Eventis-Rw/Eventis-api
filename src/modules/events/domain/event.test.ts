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
  location: "KG 9 Ave, Kimihurura",
  startDate: new Date("2026-10-01T00:00:00.000Z"),
  time: "18:00",
  status: "draft",
  viewsCount: 0,
  savesCount: 0,
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

describe("free and paid entry", () => {
  const props = {
    title: "Kigali Jazz Night",
    location: "KG 9 Ave, Kimihurura",
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    time: "18:00",
    posterId: base.posterId,
  };
  const now = new Date("2026-09-01T00:00:00.000Z");
  const tickets = "https://tickets.example.rw/jazz";

  it("free entry stores no price or ticket link", () => {
    const event = createEvent({ ...props, isPaid: false, priceMinor: 5000n, bookingUrl: tickets }, now);
    expect(event.isPaid).toBe(false);
    expect(event.priceMinor).toBeNull();
    expect(event.bookingUrl).toBeNull();
  });

  it("paid entry needs the external ticket link but not a price", () => {
    const event = createEvent({ ...props, isPaid: true, bookingUrl: tickets }, now);
    expect(event.isPaid).toBe(true);
    expect(event.priceMinor).toBeNull();
    expect(event.bookingUrl).toBe(tickets);
    expect(createEvent({ ...props, isPaid: true, priceMinor: 5000n, bookingUrl: tickets }, now).priceMinor).toBe(5000n);
  });

  it("rejects paid entry without a ticket link, or with a zero price", () => {
    expect(() => createEvent({ ...props, isPaid: true }, now)).toThrow(/ticket link/);
    expect(() => createEvent({ ...props, isPaid: true, priceMinor: 0n, bookingUrl: tickets }, now)).toThrow(/price/);
  });

  it("switching to free clears the price and ticket link", () => {
    const paid: Event = { ...base, isPaid: true, priceMinor: 5000n, bookingUrl: tickets };
    const updated = applyEventUpdate(paid, { isPaid: false });
    expect(updated.priceMinor).toBeNull();
    expect(updated.bookingUrl).toBeNull();
  });

  it("an older paid event without a link can still get unrelated edits, but not a paid update", () => {
    const legacy: Event = { ...base, isPaid: true, priceMinor: 5000n, bookingUrl: null };
    expect(applyEventUpdate(legacy, { title: "New title" }).title).toBe("New title");
    expect(() => applyEventUpdate(legacy, { isPaid: true })).toThrow(/ticket link/);
    expect(applyEventUpdate(legacy, { isPaid: true, bookingUrl: tickets }).bookingUrl).toBe(tickets);
  });
});
