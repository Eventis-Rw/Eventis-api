import { sql } from 'drizzle-orm';
import {
  bigserial,
  char,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Transactional outbox.
 *
 * Never call an external service inside a database transaction, and never call one
 * right after commit and hope. The row is written in the SAME transaction as the
 * business change, so it commits or it does not. A repeatable job polls unpublished
 * rows and enqueues the real work.
 *
 * Delivery is at-least-once. EVERY consumer must be idempotent.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    aggregateType: varchar('aggregate_type', { length: 50 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    lastError: varchar('last_error', { length: 500 }),
  },
  (t) => [
    // Partial index — the poller only ever looks at unpublished rows, and this table
    // grows forever. A full index on created_at would be mostly dead weight.
    index('outbox_unpublished_idx').on(t.createdAt).where(sql`${t.publishedAt} IS NULL`),
    index('outbox_aggregate_idx').on(t.aggregateType, t.aggregateId),
  ],
);

/**
 * Idempotency keys.
 *
 * Applied by an interceptor to every POST that creates an order, a payment or a
 * ticket. Same key and same body hash replays the stored response; same key and a
 * different hash is a 422.
 *
 * This is what stops a user on a dropping connection from buying three tickets by
 * tapping three times.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: varchar('key', { length: 120 }).notNull(),
    endpoint: varchar('endpoint', { length: 120 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    responseStatus: smallint('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.endpoint] }), index('idempotency_created_idx').on(t.createdAt)],
);

/**
 * Audit log. Every admin mutation lands here, append-only.
 *
 * When an organizer asks why their event was taken down in three months, this is
 * the only thing that can answer.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    actorId: uuid('actor_id'),
    actorRole: varchar('actor_role', { length: 30 }).notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    subjectType: varchar('subject_type', { length: 50 }).notNull(),
    subjectId: uuid('subject_id'),
    /** Before and after. Never include a secret, a token or a full phone number. */
    changes: jsonb('changes').notNull().default({}),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_subject_idx').on(t.subjectType, t.subjectId, t.id),
    index('audit_actor_idx').on(t.actorId, t.id),
  ],
);
