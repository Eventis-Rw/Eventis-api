-- Extensions must exist before anything that depends on them.
--
-- Prisma can declare extensions in schema.prisma (postgresqlExtensions preview),
-- but PostGIS geography columns, GiST indexes, deferred constraint triggers and
-- generated tsvector columns still require hand-written SQL. See ADR 0009 and
-- docs/guides/migrations.md.
--
--   postgis   geography columns and GiST indexes that discovery will depend on
--   pg_trgm   fuzzy matching on misspelled venue names in search

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'cancelled');

-- CreateTable
CREATE TABLE "outbox" (
    "id" BIGSERIAL NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(120) NOT NULL,
    "endpoint" VARCHAR(120) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "response_status" SMALLINT,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_key_endpoint_pk" PRIMARY KEY ("key","endpoint")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_role" VARCHAR(30) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "subject_type" VARCHAR(50) NOT NULL,
    "subject_id" UUID,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "icon_key" VARCHAR(60),
    "position" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "venue_name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_aggregate_idx" ON "outbox"("aggregate_type", "aggregate_id");

-- Partial index — the poller only looks at unpublished rows.
CREATE INDEX "outbox_unpublished_idx" ON "outbox"("created_at") WHERE "published_at" IS NULL;

-- CreateIndex
CREATE INDEX "idempotency_created_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "audit_subject_idx" ON "audit_log"("subject_type", "subject_id", "id");

-- CreateIndex
CREATE INDEX "audit_actor_idx" ON "audit_log"("actor_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_position_idx" ON "categories"("position");

-- CreateIndex
CREATE INDEX "events_status_starts_idx" ON "events"("status", "starts_at");
