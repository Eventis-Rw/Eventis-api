-- Convert legacy lowercase role values to the persisted UserRole enum.
ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "user_role"
  USING (
    CASE
      WHEN UPPER("role"::text) = 'ADMIN' THEN 'ADMIN'
      ELSE 'CUSTOMER'
    END
  )::"user_role";

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
