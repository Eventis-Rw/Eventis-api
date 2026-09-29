import { z } from "zod";

import { EVENT_STATUSES } from "../../domain/event-status.js";

/**
 * API input for PATCH /events/:id.
 *
 * Local to the reference module — same rationale as create-event.dto.ts.
 */
export const updateEventDto = z
  .object({
    title: z.string().trim().min(4).max(160).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    venueName: z.string().trim().min(2).max(160).optional(),
    address: z.string().trim().min(4).max(255).optional(),
  })
  .refine(
    (v) =>
      v.startsAt === undefined ||
      v.endsAt === undefined ||
      v.endsAt > v.startsAt,
    {
      message: "the event must end after it starts",
      path: ["endsAt"],
    },
  );

export type UpdateEventDto = z.infer<typeof updateEventDto>;
