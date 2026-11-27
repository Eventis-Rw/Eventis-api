-- Speeds up the public/admin event listings, which filter by status and
-- sort newest-posted-first (created_at desc). Previously only
-- (status, start_date) was indexed, which doesn't help a created_at sort.
CREATE INDEX "events_status_created_idx" ON "events"("status", "created_at");
