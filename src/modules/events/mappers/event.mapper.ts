import type { Event, EventStatus } from "../domain/event.js";

export interface EventResponse {
  event_id: string;
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  category: string | null;
  location: string;
  start_date: string;
  time: string;
  status: EventStatus;
  views_count: number;
  poster_id: string;
  created_at: string;
  updated_at: string;
}

export function toEventResponse(event: Event, coverUrl?: string | null): EventResponse {
  const formattedStartDate = event.startDate instanceof Date
    ? event.startDate.toISOString().split("T")[0]!
    : String(event.startDate);

  return {
    event_id: event.eventId,
    id: event.eventId,
    title: event.title,
    description: event.description,
    cover_image: coverUrl !== undefined ? coverUrl : event.coverImage,
    category: event.category,
    location: event.location,
    start_date: formattedStartDate,
    time: event.time,
    status: event.status,
    views_count: event.viewsCount,
    poster_id: event.posterId,
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
  };
}
