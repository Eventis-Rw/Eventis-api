import { z } from "zod";

import { EVENT_STATUSES } from "../../domain/event-status.js";

export const listEventsDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
});

export type ListEventsDto = z.infer<typeof listEventsDto>;
