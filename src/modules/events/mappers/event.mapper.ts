import type { Event, EventStatus } from "../domain/event.js";

export interface EventResponse {
  event_id: string;
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  category: string | null;
  category_id: string | null;
  location: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  time: string;
  end_date: string | null;
  end_time: string | null;
  timezone: string;
  status: EventStatus;
  capacity: number | null;
  is_paid: boolean;
  price_minor: string | null;
  currency: string;
  booking_url: string | null;
  instructions: string | null;
  tags: string[];
  organisation_id: string | null;
  views_count: number;
  saves_count: number;
  rating_avg: number;
  review_count: number;
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
    category_id: event.categoryId,
    location: event.location,
    city: event.city,
    latitude: event.latitude,
    longitude: event.longitude,
    start_date: formattedStartDate,
    time: event.time,
    end_date: event.endDate
      ? event.endDate.toISOString().split("T")[0]!
      : null,
    end_time: event.endTime,
    timezone: event.timezone,
    status: event.status,
    capacity: event.capacity,
    is_paid: event.isPaid,
    price_minor: event.priceMinor?.toString() ?? null,
    currency: event.currency,
    booking_url: event.bookingUrl,
    instructions: event.instructions,
    tags: event.tags,
    organisation_id: event.organisationId,
    views_count: event.viewsCount,
    saves_count: event.savesCount,
    rating_avg: event.ratingAvg,
    review_count: event.reviewCount,
    poster_id: event.posterId,
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
  };
}
