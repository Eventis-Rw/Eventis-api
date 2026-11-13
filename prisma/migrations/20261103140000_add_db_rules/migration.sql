-- Add database-level rules and missing indexes from the Eventis specification.

ALTER TABLE "events"
  ADD CONSTRAINT "events_capacity_check"
  CHECK ("capacity" IS NULL OR "capacity" >= 1);

ALTER TABLE "events"
  ADD CONSTRAINT "events_paid_check"
  CHECK (
    NOT "is_paid"
    OR ("price_minor" IS NOT NULL AND "price_minor" > 0 AND "booking_url" IS NOT NULL)
  );

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_check"
  CHECK ("rating" >= 1 AND "rating" <= 5);

CREATE INDEX IF NOT EXISTS "events_title_trgm_idx"
  ON "events" USING gin ("title" gin_trgm_ops);
