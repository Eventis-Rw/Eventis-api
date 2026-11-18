-- Shared FindLove/Eventis messaging context. Existing conversations stay
-- intact and are attributed to EVENTIS (this API's original chat surface).

CREATE TYPE "messaging_service" AS ENUM ('FINDLOVE', 'EVENTIS');
CREATE TYPE "love_profile_type" AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE "connection_request_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

ALTER TABLE "users"
    ADD COLUMN "find_love_profile_type" "love_profile_type" NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE "conversations"
    ADD COLUMN "service" "messaging_service",
    ADD COLUMN "context_id" UUID;

-- Prefixing legacy pair keys adds seven characters, so widen the column first.
ALTER TABLE "conversations"
    ALTER COLUMN "direct_pair_key" TYPE VARCHAR(100);

UPDATE "conversations" SET "service" = 'EVENTIS' WHERE "service" IS NULL;

UPDATE "conversations"
SET "direct_pair_key" = 'EVENTIS:' || "direct_pair_key"
WHERE "direct_pair_key" IS NOT NULL
  AND "direct_pair_key" NOT LIKE 'FINDLOVE:%'
  AND "direct_pair_key" NOT LIKE 'EVENTIS:%';

ALTER TABLE "conversations"
    ALTER COLUMN "service" SET NOT NULL;

CREATE INDEX "conversations_service_idx" ON "conversations"("service");
CREATE INDEX "conversations_service_context_idx" ON "conversations"("service", "context_id");

CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_registrations_unique" ON "event_registrations"("event_id", "user_id");
CREATE INDEX "event_registrations_user_idx" ON "event_registrations"("user_id");

ALTER TABLE "event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations"
    ADD CONSTRAINT "event_registrations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connection_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "status" "connection_request_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connection_requests_conversation_id_key" ON "connection_requests"("conversation_id");
CREATE INDEX "connection_requests_pair_idx" ON "connection_requests"("requester_id", "recipient_id");

ALTER TABLE "connection_requests"
    ADD CONSTRAINT "connection_requests_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connection_requests"
    ADD CONSTRAINT "connection_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connection_requests"
    ADD CONSTRAINT "connection_requests_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "service_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "service" "messaging_service" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_subscriptions_lookup_idx" ON "service_subscriptions"("user_id", "service", "expires_at");

ALTER TABLE "service_subscriptions"
    ADD CONSTRAINT "service_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_blocks_unique" ON "user_blocks"("blocker_id", "blocked_id");
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks"("blocked_id");

ALTER TABLE "user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey"
    FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey"
    FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "reason" VARCHAR(80) NOT NULL,
    "details" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_reports_subject_idx" ON "user_reports"("reported_user_id", "created_at");

ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_reported_user_id_fkey"
    FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
