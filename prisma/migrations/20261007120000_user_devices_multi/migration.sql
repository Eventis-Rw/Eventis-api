ALTER TABLE "user_devices"
  DROP CONSTRAINT IF EXISTS "user_devices_user_id_key";

DROP INDEX IF EXISTS "user_devices_user_id_key";
DROP INDEX IF EXISTS "user_devices_device_id_key";

ALTER TABLE "user_devices"
  ADD COLUMN IF NOT EXISTS "os_version" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "app_version" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_device_unique"
  ON "user_devices"("user_id", "device_id");

CREATE INDEX IF NOT EXISTS "user_devices_user_revoked_idx"
  ON "user_devices"("user_id", "revoked_at");
