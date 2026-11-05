import { z } from 'zod';

import { currency, moneyWire } from './money.js';
import { organizerSummary } from './organizers.js';
import { geoPoint, isoDateTime, latitude, longitude, slug, uuid } from './primitives.js';

export const eventStatus = z.enum([
  'draft',
  'pending_review',
  'published',
  'cancelled',
  'completed',
]);
export type EventStatus = z.infer<typeof eventStatus>;

export const category = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  iconKey: z.string().nullable(),
});
export type Category = z.infer<typeof category>;

/** The feed query. Every parameter is optional so an unlocated first-run still returns something. */
export const eventListQuery = z
  .object({
    lat: latitude.optional(),
    lng: longitude.optional(),
    radiusKm: z.coerce.number().int().min(1).max(100).default(25),
    categoryId: uuid.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().trim().max(120).optional(),
    isFree: z.coerce.boolean().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat and lng must be provided together',
    path: ['lng'],
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    message: 'to must not be before from',
    path: ['to'],
  });
export type EventListQuery = z.infer<typeof eventListQuery>;

/** What the feed returns. Deliberately small — the feed is the hottest path in the product. */
export const eventSummary = z.object({
  id: uuid,
  slug,
  title: z.string(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  venueName: z.string(),
  /** Null when the caller sent no coordinates. Clients must handle null, not assume 0. */
  distanceMeters: z.number().nullable(),
  isFree: z.boolean(),
  /** Lowest paid price. Null for a free event. String of minor units. */
  priceFromMinor: moneyWire.nullable(),
  currency,
  coverUrl: z.url().nullable(),
  categoryId: uuid,
  organizer: organizerSummary,
  isSoldOut: z.boolean(),
});
export type EventSummary = z.infer<typeof eventSummary>;

export const ticketTypeSummary = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  priceMinor: moneyWire,
  currency,
  /** Null means uncapped. */
  quantityRemaining: z.number().int().min(0).nullable(),
  maxPerOrder: z.number().int().min(1).max(20),
  salesStartAt: isoDateTime.nullable(),
  salesEndAt: isoDateTime.nullable(),
  isSoldOut: z.boolean(),
});
export type TicketTypeSummary = z.infer<typeof ticketTypeSummary>;

export const eventDetail = eventSummary.extend({
  description: z.string(),
  address: z.string(),
  location: geoPoint.nullable(),
  status: eventStatus,
  capacity: z.number().int().positive().nullable(),
  galleryUrls: z.array(z.url()),
  ticketTypes: z.array(ticketTypeSummary),
  publishedAt: isoDateTime.nullable(),
});
export type EventDetail = z.infer<typeof eventDetail>;

// ---------- Organizer-facing writes ----------

export const ticketTypeInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  priceMinor: moneyWire,
  quantityTotal: z.number().int().min(1).max(1_000_000).nullable(),
  maxPerOrder: z.number().int().min(1).max(20).default(10),
  salesStartAt: z.coerce.date().optional(),
  salesEndAt: z.coerce.date().optional(),
});
export type TicketTypeInput = z.infer<typeof ticketTypeInput>;

export const eventInput = z
  .object({
    title: z.string().trim().min(4).max(160),
    categoryId: uuid,
    description: z.string().trim().min(20).max(10_000),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    venueName: z.string().trim().min(2).max(160),
    address: z.string().trim().min(4).max(255),
    location: geoPoint.nullable(),
    capacity: z.number().int().positive().max(1_000_000).nullable(),
    coverKey: z.string().min(1).nullable(),
    galleryKeys: z.array(z.string().min(1)).max(10).default([]),
    ticketTypes: z.array(ticketTypeInput).min(1).max(20),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'the event must end after it starts',
    path: ['endsAt'],
  })
  .refine((v) => v.ticketTypes.every((t) => !t.salesEndAt || t.salesEndAt <= v.endsAt), {
    message: 'ticket sales cannot end after the event ends',
    path: ['ticketTypes'],
  });
export type EventInput = z.infer<typeof eventInput>;
