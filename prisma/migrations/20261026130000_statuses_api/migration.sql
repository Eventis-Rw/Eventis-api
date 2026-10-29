ALTER TABLE "event_stories" RENAME TO "statuses";
ALTER TABLE "statuses" RENAME COLUMN "owner_id" TO "user_id";
ALTER TABLE "statuses" ADD COLUMN "caption" VARCHAR(1000);
ALTER TABLE "statuses" ALTER COLUMN "background" SET DEFAULT '#101827';
ALTER TABLE "statuses" ALTER COLUMN "fit" SET DEFAULT 'cover';
ALTER INDEX "event_stories_expiry_idx" RENAME TO "statuses_expiry_idx";
ALTER INDEX "event_stories_owner_idx" RENAME TO "statuses_user_idx";
ALTER TABLE "statuses" RENAME CONSTRAINT "event_stories_pkey" TO "statuses_pkey";
ALTER TABLE "statuses" RENAME CONSTRAINT "event_stories_owner_id_fkey" TO "statuses_user_id_fkey";
ALTER TABLE "statuses" RENAME CONSTRAINT "event_stories_event_id_fkey" TO "statuses_event_id_fkey";
CREATE TABLE "status_views" (
  "status_id" UUID NOT NULL,
  "viewer_id" UUID NOT NULL,
  "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "status_views_pkey" PRIMARY KEY ("status_id", "viewer_id"),
  CONSTRAINT "status_views_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "status_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "status_views_viewer_idx" ON "status_views"("viewer_id", "viewed_at");
