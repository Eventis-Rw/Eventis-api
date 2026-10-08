-- Identity: evolve users for phone-first auth, add OTP / device / refresh tables (ADR 0006).
-- Compatible with DBs that already have a legacy `users` table (user_id PK) and with
-- fresh installs that only have the init migration.

CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "otp_purpose" AS ENUM ('SIGN_IN');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id'
  ) THEN
    -- Legacy shape from local event_management experiments.
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'events_poster_id_fkey'
    ) THEN
      ALTER TABLE "events" DROP CONSTRAINT "events_poster_id_fkey";
    END IF;

    ALTER TABLE "users" RENAME COLUMN "user_id" TO "id";
    ALTER TABLE "users" ALTER COLUMN "phone" TYPE VARCHAR(30);

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'avatar_url'
    ) THEN
      ALTER TABLE "users" ADD COLUMN "avatar_url" VARCHAR(500);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'status'
    ) THEN
      ALTER TABLE "users" ADD COLUMN "status" "user_status" NOT NULL DEFAULT 'ACTIVE';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'poster_id'
    ) THEN
      ALTER TABLE "events"
        ADD CONSTRAINT "events_poster_id_fkey"
        FOREIGN KEY ("poster_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    CREATE TABLE "users" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "phone" VARCHAR(30) NOT NULL,
      "display_name" VARCHAR(60),
      "avatar_url" VARCHAR(500),
      "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT "users_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
  ELSE
    -- users exists with id already — ensure auth columns.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'avatar_url'
    ) THEN
      ALTER TABLE "users" ADD COLUMN "avatar_url" VARCHAR(500);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'status'
    ) THEN
      ALTER TABLE "users" ADD COLUMN "status" "user_status" NOT NULL DEFAULT 'ACTIVE';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "otp_verifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone" VARCHAR(30) NOT NULL,
  "code_hash" VARCHAR(128) NOT NULL,
  "purpose" "otp_purpose" NOT NULL DEFAULT 'SIGN_IN',
  "device_id" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "attempts" SMALLINT NOT NULL DEFAULT 0,
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_phone_purpose_idx" ON "otp_verifications"("phone", "purpose");
CREATE INDEX IF NOT EXISTS "otp_phone_created_idx" ON "otp_verifications"("phone", "created_at");
CREATE INDEX IF NOT EXISTS "otp_device_created_idx" ON "otp_verifications"("device_id", "created_at");

CREATE TABLE IF NOT EXISTS "user_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "device_id" VARCHAR(255) NOT NULL,
  "credential_hash" VARCHAR(128) NOT NULL,
  "device_name" VARCHAR(255),
  "platform" VARCHAR(50),
  "last_seen_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_user_id_key" ON "user_devices"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_device_id_key" ON "user_devices"("device_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_devices_user_id_fkey'
  ) THEN
    ALTER TABLE "user_devices"
      ADD CONSTRAINT "user_devices_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "refresh_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "family_id" UUID NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "device_id" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "replaced_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX IF NOT EXISTS "refresh_sessions_family_idx" ON "refresh_sessions"("family_id");
CREATE INDEX IF NOT EXISTS "refresh_sessions_user_idx" ON "refresh_sessions"("user_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'refresh_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE "refresh_sessions"
      ADD CONSTRAINT "refresh_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
