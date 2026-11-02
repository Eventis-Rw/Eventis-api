/**
 * DOMAIN LAYER.
 *
 * Pure. No database, no Nest, no HTTP, no clock reads. Everything here is a value or
 * a rule you can test by calling it with arguments.
 */

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface Event {
  readonly eventId: string;
  readonly title: string;
  readonly description: string | null;
  readonly coverImage: string | null;
  readonly category: string | null;
  readonly location: string;
  readonly startDate: Date;
  readonly time: string;
  readonly status: EventStatus;
  readonly viewsCount: number;
  readonly posterId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEventProps {
  title: string;
  description?: string | null | undefined;
  coverImage?: string | null | undefined;
  category?: string | null | undefined;
  location: string;
  startDate: Date;
  time: string;
  status?: EventStatus | undefined;
  posterId: string;
}

export interface UpdateEventProps {
  title?: string | undefined;
  description?: string | null | undefined;
  coverImage?: string | null | undefined;
  category?: string | null | undefined;
  location?: string | undefined;
  startDate?: Date | undefined;
  time?: string | undefined;
  status?: EventStatus | undefined;
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
  if (from === "draft" && (to === "published" || to === "cancelled")) return true;
  if (from === "published" && to === "cancelled") return true;
  return false;
}

export function createEvent(
  props: CreateEventProps,
  now: Date,
): Omit<Event, "eventId"> {
  assertValidDate(props.startDate);
  assertValidTime(props.time);

  return {
    title: props.title.trim(),
    description: props.description?.trim() ?? null,
    coverImage: props.coverImage ?? null,
    category: props.category?.trim() ?? null,
    location: props.location.trim(),
    startDate: props.startDate,
    time: props.time.trim(),
    status: props.status ?? "draft",
    viewsCount: 0,
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
    location: props.location !== undefined ? props.location.trim() : event.location,
    startDate: props.startDate !== undefined ? props.startDate : event.startDate,
    time: props.time !== undefined ? props.time.trim() : event.time,
    status: props.status ?? event.status,
    updatedAt: event.updatedAt,
  };

  assertValidDate(next.startDate);
  assertValidTime(next.time);

  if (props.status !== undefined && !canTransition(event.status, props.status)) {
    throw new Error(`cannot transition event from ${event.status} to ${props.status}`);
  }

  return next;
}
