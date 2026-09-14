/**
 * Seeds a local database with enough data to see the product work.
 *
 * An intern's first day should end with a running stack showing a populated feed, an
 * approval queue with things in it, and a realistic query plan — not an empty screen.
 *
 * Currently seeds categories. Events, organizers, users and orders are added alongside
 * the modules that own them (Sprints 1–3), by whoever builds each one.
 *
 * Idempotent: safe to run repeatedly.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loadEnv } from '../src/config/env.js';
import { categories } from '../src/infra/database/schema/catalog.js';

const CATEGORIES = [
  { slug: 'music', name: 'Music', iconKey: 'music', position: 10 },
  { slug: 'nightlife', name: 'Nightlife', iconKey: 'moon', position: 20 },
  { slug: 'tech', name: 'Tech', iconKey: 'cpu', position: 30 },
  { slug: 'business', name: 'Business', iconKey: 'briefcase', position: 40 },
  { slug: 'sports', name: 'Sports', iconKey: 'activity', position: 50 },
  { slug: 'arts', name: 'Arts & Culture', iconKey: 'palette', position: 60 },
  { slug: 'food', name: 'Food & Drink', iconKey: 'utensils', position: 70 },
  { slug: 'faith', name: 'Faith', iconKey: 'heart', position: 80 },
  { slug: 'community', name: 'Community', iconKey: 'users', position: 90 },
  { slug: 'education', name: 'Education', iconKey: 'book', position: 100 },
];

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);

try {
  await db.insert(categories).values(CATEGORIES).onConflictDoNothing({ target: categories.slug });
  console.warn(`seeded ${CATEGORIES.length} categories`);
} finally {
  await sql.end();
}
