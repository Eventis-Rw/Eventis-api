import { z } from 'zod';

import { cursor } from './primitives.js';

/**
 * Cursor pagination everywhere. Offset pagination breaks the moment rows are
 * inserted between two page loads, which on a feed sorted by distance and time
 * is constantly.
 */
export const pageQuery = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

export function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
