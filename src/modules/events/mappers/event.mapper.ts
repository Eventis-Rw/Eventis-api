import type { Event } from "../domain/event.js";

/**
 * The API NEVER returns a database row or a domain object directly.
 *
 * This response shape is the architecture-demo contract for events. The full
 * EventDetail / EventSummary types in @eventis/contracts require organizers,
 * ticket types and media — those land with their owning modules. Until then,
 * this mapper is the explicit boundary between domain and HTTP.
 */
export interface EventResponse {
  id: string;
  title: string;
  description: string | null;
  status: Event["status"];
  startsAt: string;
  endsAt: string;
  venueName: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export function toEventResponse(event: Event): EventResponse {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venueName: event.venueName,
    address: event.address,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
