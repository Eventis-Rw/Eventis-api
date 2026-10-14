-- Make customer the default public account type and add a separate admin role.
-- Recreate the enum so CUSTOMER can be used in this transaction. PostgreSQL
-- does not allow a newly added enum value to be used before the transaction
-- that adds it is committed.
ALTER TABLE "users"
  ALTER COLUMN "account_type" DROP DEFAULT;

ALTER TYPE "account_type" RENAME TO "account_type_old";
CREATE TYPE "account_type" AS ENUM ('POSTER', 'CUSTOMER', 'LOVE');

ALTER TABLE "users"
  ALTER COLUMN "account_type" TYPE "account_type"
  USING "account_type"::text::"account_type";

ALTER TABLE "otp_verifications"
  ALTER COLUMN "account_type" TYPE "account_type"
  USING "account_type"::text::"account_type";

DROP TYPE "account_type_old";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE "user_role" AS ENUM ('CUSTOMER', 'ADMIN');
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" "user_role" NOT NULL DEFAULT 'CUSTOMER';

ALTER TABLE "users"
  ALTER COLUMN "account_type" SET DEFAULT 'CUSTOMER';

UPDATE "users"
SET "account_type" = 'CUSTOMER'
WHERE "account_type" = 'LOVE';

UPDATE "otp_verifications"
SET "account_type" = 'CUSTOMER'
WHERE "account_type" = 'LOVE';
