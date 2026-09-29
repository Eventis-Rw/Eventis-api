/**
 * The public surface of the events module. Nothing else leaves.
 *
 * Other modules call the exported use-case services. They never import the
 * repository, never touch the `events` table, and never reach past this file.
 * dependency-cruiser fails the build if they try.
 */
export { EventsModule } from "./events.module.js";
export { CreateEventService } from "./application/create-event.service.js";
export { GetEventService } from "./application/get-event.service.js";
export { UpdateEventService } from "./application/update-event.service.js";
export type { Event, EventStatus } from "./domain/event.js";
