-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "display_name" VARCHAR(60),
    "role" VARCHAR(30) NOT NULL DEFAULT 'customer',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- Insert default poster user for any existing events
INSERT INTO "users" ("user_id", "phone", "display_name", "role", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', '+250780000001', 'Default Poster', 'organizer_owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("phone") DO NOTHING;

-- AlterTable events
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'id'
    ) THEN
        ALTER TABLE "events" RENAME COLUMN "id" TO "event_id";
    END IF;
END $$;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cover_image" VARCHAR(500);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "category" VARCHAR(60);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "location" VARCHAR(255);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "start_date" DATE;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "time" VARCHAR(20);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "views_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "poster_id" UUID;

-- Backfill data from legacy columns if they exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'starts_at'
    ) THEN
        UPDATE "events"
        SET 
            "start_date" = COALESCE("start_date", "starts_at"::date),
            "time" = COALESCE("time", to_char("starts_at", 'HH24:MI'))
        WHERE "start_date" IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'address'
    ) THEN
        UPDATE "events"
        SET "location" = COALESCE("location", "address")
        WHERE "location" IS NULL;
    END IF;
END $$;

UPDATE "events" SET "location" = 'Kigali' WHERE "location" IS NULL;
UPDATE "events" SET "start_date" = CURRENT_DATE WHERE "start_date" IS NULL;
UPDATE "events" SET "time" = '18:00' WHERE "time" IS NULL;
UPDATE "events" SET "poster_id" = '00000000-0000-4000-8000-000000000001' WHERE "poster_id" IS NULL;

ALTER TABLE "events" ALTER COLUMN "location" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "start_date" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "time" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "poster_id" SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'starts_at'
    ) THEN
        ALTER TABLE "events" DROP COLUMN "starts_at";
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'ends_at'
    ) THEN
        ALTER TABLE "events" DROP COLUMN "ends_at";
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'venue_name'
    ) THEN
        ALTER TABLE "events" DROP COLUMN "venue_name";
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'address'
    ) THEN
        ALTER TABLE "events" DROP COLUMN "address";
    END IF;
END $$;

DROP INDEX IF EXISTS "events_status_starts_idx";

CREATE INDEX IF NOT EXISTS "events_status_start_idx" ON "events"("status", "start_date");
CREATE INDEX IF NOT EXISTS "events_poster_idx" ON "events"("poster_id");
CREATE INDEX IF NOT EXISTS "events_category_idx" ON "events"("category");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'events_poster_id_fkey'
    ) THEN
        ALTER TABLE "events" ADD CONSTRAINT "events_poster_id_fkey" 
        FOREIGN KEY ("poster_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
