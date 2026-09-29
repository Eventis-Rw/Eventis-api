/**
 * DOMAIN LAYER.
 *
 * Pure. No database, no Nest, no HTTP, no clock reads. Everything here is a value or
 * a rule you can test by calling it with arguments.
 */

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface Event {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: EventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly venueName: string;
  readonly address: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEventProps {
  title: string;
  description?: string | null | undefined;
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  address: string;
}

export interface UpdateEventProps {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: EventStatus | undefined;
  startsAt?: Date | undefined;
  endsAt?: Date | undefined;
  venueName?: string | undefined;
  address?: string | undefined;
}

/** An event must end after it starts. */
export function assertValidSchedule(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) {
    throw new Error("the event must end after it starts");
  }
}

/** Only draft events can be published or cancelled through the reference flow. */
export function canTransition(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true;
  if (from === "draft" && (to === "published" || to === "cancelled"))
    return true;
  if (from === "published" && to === "cancelled") return true;
  return false;
}

export function createEvent(
  props: CreateEventProps,
  now: Date,
): Omit<Event, "id"> {
  assertValidSchedule(props.startsAt, props.endsAt);
  return {
    title: props.title,
    description: props.description ?? null,
    status: "draft",
    startsAt: props.startsAt,
    endsAt: props.endsAt,
    venueName: props.venueName,
    address: props.address,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyEventUpdate(event: Event, props: UpdateEventProps): Event {
  const next: Event = {
    ...event,
    title: props.title ?? event.title,
    description:
      props.description !== undefined ? props.description : event.description,
    status: props.status ?? event.status,
    startsAt: props.startsAt ?? event.startsAt,
    endsAt: props.endsAt ?? event.endsAt,
    venueName: props.venueName ?? event.venueName,
    address: props.address ?? event.address,
    updatedAt: event.updatedAt,
  };

  assertValidSchedule(next.startsAt, next.endsAt);

  if (
    props.status !== undefined &&
    !canTransition(event.status, props.status)
  ) {
    throw new Error(
      `cannot transition event from ${event.status} to ${props.status}`,
    );
  }

  return next;
}
