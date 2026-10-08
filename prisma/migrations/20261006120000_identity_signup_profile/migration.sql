-- Complete phone-first signup and deferred profile completion. Keep this additive
-- so databases carrying older profile fields can migrate without a drop/rename.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE "account_type" AS ENUM ('POSTER', 'LOVE');
  END IF;
END $$;
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'SIGN_UP';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "account_type" "account_type" NOT NULL DEFAULT 'LOVE',
  ADD COLUMN IF NOT EXISTS "organization_name" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "organization_description" TEXT,
  ADD COLUMN IF NOT EXISTS "date_of_birth" DATE,
  ADD COLUMN IF NOT EXISTS "gender" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "location" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "interested_in" VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

ALTER TABLE "otp_verifications"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "account_type" "account_type";
