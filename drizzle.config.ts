import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle generates plain SQL files that we own and can edit. That is the whole
 * reason it was chosen over Prisma: four things this system needs cannot be
 * expressed in a Prisma schema — the PostGIS geography column, the ledger's
 * deferred sum-to-zero trigger, the append-only rule on ledger entries, and the
 * generated search vector. See docs/adr/0003.
 */
export default defineConfig({
  schema: './src/infra/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
  strict: true,
});
