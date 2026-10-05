import { z } from "zod";

import { EVENT_STATUSES } from "../../domain/event-status.js";

const optionalDateSchema = z.preprocess((val) => {
  if (val === undefined) return undefined;
  if (typeof val === "string" || val instanceof Date) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return val;
}, z.date({ message: "start_date must be a valid date" }).optional());

export const updateEventDto = z.object({
  title: z
    .string()
    .trim()
    .min(4, "title must be at least 4 characters")
    .max(160, "title cannot exceed 160 characters")
    .optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  location: z
    .string()
    .trim()
    .min(2, "location must be at least 2 characters")
    .max(255, "location cannot exceed 255 characters")
    .optional(),
  start_date: optionalDateSchema,
  time: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "time must be in HH:mm format (e.g. 18:00)")
    .optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  cover_image: z.null().optional(),
});

export type UpdateEventDto = z.infer<typeof updateEventDto>;
