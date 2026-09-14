/**
 * Applies pending migrations, then exits.
 *
 * Run as a separate step before the new application version starts — never from
 * inside the API process, where two instances booting at once would race.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { loadEnv } from '../../config/env.js';

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.warn('migrations applied');
} finally {
  await sql.end();
}
