-- CreateEnum
CREATE TYPE "public"."manual_payment_method_platform" AS ENUM ('FINDLOVE', 'ORGANISER', 'BOTH');

-- AlterTable: add the new-typed column, backfill from the old one (direct
-- value mapping, FINDLOVE/ORGANISER both exist in the new enum unchanged),
-- then drop the old column and rename the new one into its place. Keeps
-- existing rows intact instead of dropping and recreating the column.
ALTER TABLE "public"."manual_payment_methods" ADD COLUMN "platform_new" "public"."manual_payment_method_platform";
UPDATE "public"."manual_payment_methods" SET "platform_new" = "platform"::text::"public"."manual_payment_method_platform";
ALTER TABLE "public"."manual_payment_methods" ALTER COLUMN "platform_new" SET NOT NULL;
ALTER TABLE "public"."manual_payment_methods" DROP COLUMN "platform";
ALTER TABLE "public"."manual_payment_methods" RENAME COLUMN "platform_new" TO "platform";

ALTER TABLE "public"."manual_payment_methods" ALTER COLUMN "account_name" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "manual_payment_methods_platform_active_idx" ON "public"."manual_payment_methods"("platform", "is_active", "display_order");
