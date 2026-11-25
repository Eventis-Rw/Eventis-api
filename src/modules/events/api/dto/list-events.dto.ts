import { z } from "zod";

export const listEventsDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  activeSince: z.string().date().optional(),
  excludeCategories: z.string().max(500).transform(value => value.split(",").map(name => name.trim()))
    .pipe(z.array(z.string().min(1).max(60)).max(20)).optional(),
  category: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
});

export type ListEventsDto = z.infer<typeof listEventsDto>;
