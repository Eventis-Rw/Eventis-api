DROP TABLE IF EXISTS "user_devices";

DROP INDEX IF EXISTS "otp_device_created_idx";

ALTER TABLE "otp_verifications"
  DROP COLUMN IF EXISTS "device_id",
  ADD COLUMN IF NOT EXISTS "pin_hash" VARCHAR(128);

ALTER TABLE "refresh_sessions"
  DROP COLUMN IF EXISTS "device_id";
