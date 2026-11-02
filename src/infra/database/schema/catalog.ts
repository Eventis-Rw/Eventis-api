import { index, pgTable, smallint, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Categories — the reference table for the worked example in modules/catalog.
 *
 * The rest of the catalog schema (events, venues, ticket types, media) lands in
 * Sprint 1 alongside the module that owns it. Adding tables nobody queries yet
 * just makes the first real migration harder to review.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 60 }).notNull(),
    iconKey: varchar('icon_key', { length: 60 }),
    /** Display order in the picker. Lower first. */
    position: smallint('position').notNull().default(0),
  },
  (t) => [index('categories_position_idx').on(t.position)],
);

export type CategoryRow = typeof categories.$inferSelect;
