import { z } from "zod";

/**
 * API input for POST /events.
 *
 * Kept local to the reference module so the architecture demo does not require
 * organizers, ticket types or media. Production create payloads will move into
 * @eventis/contracts (see eventInput) once sibling modules exist.
 */
export const createEventDto = z
  .object({
    title: z.string().trim().min(4).max(160),
    description: z.string().trim().max(10_000).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    venueName: z.string().trim().min(2).max(160),
    address: z.string().trim().min(4).max(255),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: "the event must end after it starts",
    path: ["endsAt"],
  });

export type CreateEventDto = z.infer<typeof createEventDto>;
