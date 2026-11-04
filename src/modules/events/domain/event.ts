/**
 * DOMAIN LAYER.
 *
 * Pure. No database, no Nest, no HTTP, no clock reads. Everything here is a value or
 * a rule you can test by calling it with arguments.
 */

export const EVENT_STATUSES = [
  "draft",
  "published",
  "paused",
  "cancelled",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface Event {
  readonly eventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly coverImage: string | null;
  readonly category: string | null;
  readonly categoryId: string | null;
  readonly location: string;
  readonly city: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly startDate: Date;
  readonly time: string;
  readonly endDate: Date | null;
  readonly endTime: string | null;
  readonly timezone: string;
  readonly status: EventStatus;
  readonly capacity: number | null;
  readonly isPaid: boolean;
  readonly priceMinor: bigint | null;
  readonly currency: string;
  readonly bookingUrl: string | null;
  readonly instructions: string | null;
  readonly tags: string[];
  readonly organisationId: string | null;
  readonly viewsCount: number;
  readonly ratingAvg: number;
  readonly reviewCount: number;
  readonly posterId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEventProps {
  title: string;
  description?: string | null | undefined;
  coverImage?: string | null | undefined;
  category?: string | null | undefined;
  categoryId?: string | null | undefined;
  location: string;
  city?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  startDate: Date;
  time: string;
  endDate?: Date | null | undefined;
  endTime?: string | null | undefined;
  timezone?: string | undefined;
  status?: EventStatus | undefined;
  capacity?: number | null | undefined;
  isPaid?: boolean | undefined;
  priceMinor?: bigint | null | undefined;
  currency?: string | undefined;
  bookingUrl?: string | null | undefined;
  instructions?: string | null | undefined;
  tags?: string[] | undefined;
  organisationId?: string | null | undefined;
  posterId: string;
}

export interface UpdateEventProps {
  title?: string | undefined;
  description?: string | null | undefined;
  coverImage?: string | null | undefined;
  category?: string | null | undefined;
  categoryId?: string | null | undefined;
  location?: string | undefined;
  city?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  startDate?: Date | undefined;
  time?: string | undefined;
  endDate?: Date | null | undefined;
  endTime?: string | null | undefined;
  timezone?: string | undefined;
  status?: EventStatus | undefined;
  capacity?: number | null | undefined;
  isPaid?: boolean | undefined;
  priceMinor?: bigint | null | undefined;
  currency?: string | undefined;
  bookingUrl?: string | null | undefined;
  instructions?: string | null | undefined;
  tags?: string[] | undefined;
  organisationId?: string | null | undefined;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function assertValidTime(time: string): void {
  if (!TIME_REGEX.test(time.trim())) {
    throw new Error("Invalid time format. Expected HH:mm (e.g. 18:00)");
  }
}

export function assertValidDate(date: Date): void {
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }
}


export function canTransition(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true;
  if (from === "draft" && (to === "published" || to === "cancelled")) {
    return true;
  }
  if (
    from === "published" &&
    (to === "paused" || to === "cancelled")
  ) {
    return true;
  }
  if (from === "paused" && (to === "published" || to === "cancelled")) {
    return true;
  }
  return false;
}

function assertValidEndDate(startDate: Date, endDate: Date | null): void {
  assertValidDate(startDate);
  if (endDate) {
    assertValidDate(endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new Error("End date cannot be before the start date");
    }
  }
}

function assertValidPricing(
  isPaid: boolean,
  priceMinor: bigint | null,
): void {
  if (isPaid && (priceMinor === null || priceMinor <= 0n)) {
    throw new Error("Paid events require a positive price");
  }
}

export function createEvent(
  props: CreateEventProps,
  now: Date,
): Omit<Event, "eventId"> {
  assertValidDate(props.startDate);
  assertValidTime(props.time);

  const endDate = props.endDate ?? null;
  assertValidEndDate(props.startDate, endDate);
  const isPaid = props.isPaid ?? false;
  const priceMinor = isPaid ? (props.priceMinor ?? null) : null;
  assertValidPricing(isPaid, priceMinor);

  return {
    title: props.title.trim(),
    description: props.description?.trim() ?? null,
    coverImage: props.coverImage ?? null,
    category: props.category?.trim() ?? null,
    categoryId: props.categoryId ?? null,
    location: props.location.trim(),
    city: props.city?.trim() ?? null,
    latitude: props.latitude ?? null,
    longitude: props.longitude ?? null,
    startDate: props.startDate,
    time: props.time.trim(),
    endDate,
    endTime: props.endTime?.trim() ?? null,
    timezone: props.timezone?.trim() || "Africa/Kigali",
    status: props.status ?? "draft",
    capacity: props.capacity ?? null,
    isPaid,
    priceMinor,
    currency: props.currency?.trim().toUpperCase() || "RWF",
    bookingUrl: props.bookingUrl?.trim() ?? null,
    instructions: props.instructions?.trim() ?? null,
    tags: props.tags ?? [],
    organisationId: props.organisationId ?? null,
    viewsCount: 0,
    ratingAvg: 0,
    reviewCount: 0,
    posterId: props.posterId,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyEventUpdate(event: Event, props: UpdateEventProps): Event {
  const next: Event = {
    ...event,
    title: props.title !== undefined ? props.title.trim() : event.title,
    description:
      props.description !== undefined
        ? props.description === null
          ? null
          : props.description.trim()
        : event.description,
    coverImage: props.coverImage !== undefined ? props.coverImage : event.coverImage,
    category:
      props.category !== undefined
        ? props.category === null
          ? null
          : props.category.trim()
        : event.category,
    categoryId:
      props.categoryId !== undefined ? props.categoryId : event.categoryId,
    location: props.location !== undefined ? props.location.trim() : event.location,
    city:
      props.city !== undefined
        ? props.city === null
          ? null
          : props.city.trim()
        : event.city,
    latitude: props.latitude !== undefined ? props.latitude : event.latitude,
    longitude:
      props.longitude !== undefined ? props.longitude : event.longitude,
    startDate: props.startDate !== undefined ? props.startDate : event.startDate,
    time: props.time !== undefined ? props.time.trim() : event.time,
    endDate:
      props.endDate !== undefined ? props.endDate : event.endDate,
    endTime:
      props.endTime !== undefined
        ? props.endTime === null
          ? null
          : props.endTime.trim()
        : event.endTime,
    timezone:
      props.timezone !== undefined
        ? props.timezone.trim() || event.timezone
        : event.timezone,
    status: props.status ?? event.status,
    capacity:
      props.capacity !== undefined ? props.capacity : event.capacity,
    isPaid: props.isPaid !== undefined ? props.isPaid : event.isPaid,
    priceMinor:
      props.priceMinor !== undefined ? props.priceMinor : event.priceMinor,
    currency:
      props.currency !== undefined
        ? props.currency.trim().toUpperCase() || event.currency
        : event.currency,
    bookingUrl:
      props.bookingUrl !== undefined
        ? props.bookingUrl === null
          ? null
          : props.bookingUrl.trim()
        : event.bookingUrl,
    instructions:
      props.instructions !== undefined
        ? props.instructions === null
          ? null
          : props.instructions.trim()
        : event.instructions,
    tags: props.tags !== undefined ? props.tags : event.tags,
    organisationId:
      props.organisationId !== undefined
        ? props.organisationId
        : event.organisationId,
    updatedAt: event.updatedAt,
  };

  const normalized: Event = {
    ...next,
    priceMinor: next.isPaid ? next.priceMinor : null,
  };
  assertValidDate(normalized.startDate);
  assertValidTime(normalized.time);
  assertValidEndDate(normalized.startDate, normalized.endDate);
  assertValidPricing(normalized.isPaid, normalized.priceMinor);
  if (normalized.endTime) assertValidTime(normalized.endTime);

  if (props.status !== undefined && !canTransition(event.status, props.status)) {
    throw new Error(`cannot transition event from ${event.status} to ${props.status}`);
  }

  return normalized;
}
