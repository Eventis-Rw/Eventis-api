CREATE TABLE "event_stories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "event_id" UUID,
    "media_url" VARCHAR(1000),
    "media_type" VARCHAR(10) NOT NULL,
    "background" VARCHAR(30) NOT NULL,
    "fit" VARCHAR(10) NOT NULL,
    "overlays" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "event_stories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_stories_expiry_idx" ON "event_stories"("expires_at");
CREATE INDEX "event_stories_owner_idx" ON "event_stories"("owner_id", "created_at");
ALTER TABLE "event_stories" ADD CONSTRAINT "event_stories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_stories" ADD CONSTRAINT "event_stories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;
