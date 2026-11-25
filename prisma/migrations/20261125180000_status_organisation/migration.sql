ALTER TABLE "statuses" ADD COLUMN "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "statuses" s SET "organisation_id" = e."organisation_id"
FROM "events" e WHERE e."event_id" = s."event_id" AND e."organisation_id" IS NOT NULL;

WITH single_org AS (
  SELECT owner_id, (array_agg(id))[1] AS id FROM organisations
  WHERE deleted_at IS NULL GROUP BY owner_id HAVING count(*) = 1
)
UPDATE statuses s SET organisation_id = o.id FROM single_org o
WHERE s.organisation_id IS NULL AND s.user_id = o.owner_id;
