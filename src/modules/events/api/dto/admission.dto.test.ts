import { describe, expect, it } from "bun:test";

import { createEventDto } from "./create-event.dto.js";
import { updateEventDto } from "./update-event.dto.js";

const event = { title: "Kigali Jazz Night", location: "KG 9 Ave", start_date: "2026-10-01", time: "18:00" };
const tickets = "https://tickets.example.rw/jazz";

describe("event admission request rules", () => {
  it("accepts free entry and paid entry with a link and an optional price", () => {
    expect(createEventDto.safeParse({ ...event }).success).toBe(true);
    expect(createEventDto.safeParse({ ...event, is_paid: "true", booking_url: tickets }).success).toBe(true);
    expect(createEventDto.safeParse({ ...event, is_paid: "true", booking_url: tickets, price_minor: "" }).success).toBe(true);
    const priced = createEventDto.parse({ ...event, is_paid: true, booking_url: tickets, price_minor: "5000" });
    expect(priced.price_minor).toBe(5000n);
  });

  it("requires a ticket link for paid entry and a positive price when one is given", () => {
    expect(createEventDto.safeParse({ ...event, is_paid: true }).success).toBe(false);
    expect(createEventDto.safeParse({ ...event, is_paid: true, booking_url: "" }).success).toBe(false);
    expect(createEventDto.safeParse({ ...event, is_paid: true, booking_url: tickets, price_minor: "0" }).success).toBe(false);
  });

  it("only accepts web links for tickets", () => {
    expect(createEventDto.safeParse({ ...event, is_paid: true, booking_url: "javascript:alert(1)" }).success).toBe(false);
    expect(createEventDto.safeParse({ ...event, is_paid: true, booking_url: "ftp://tickets.example.rw" }).success).toBe(false);
    expect(updateEventDto.safeParse({ booking_url: "javascript:alert(1)" }).success).toBe(false);
    expect(updateEventDto.parse({ booking_url: "" }).booking_url).toBeNull();
  });

  it("multipart \"null\" clears the price and link, like capacity", () => {
    const update = updateEventDto.parse({ is_paid: "true", price_minor: "null", booking_url: tickets });
    expect(update.price_minor).toBeNull();
    expect(updateEventDto.parse({ booking_url: "null" }).booking_url).toBeNull();
  });
});
