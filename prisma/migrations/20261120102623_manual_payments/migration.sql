-- CreateEnum
CREATE TYPE "public"."manual_payment_platform" AS ENUM ('FINDLOVE', 'ORGANISER');

-- CreateEnum
CREATE TYPE "public"."manual_payment_status" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "public"."upload_purpose" ADD VALUE 'PAYMENT_RECEIPT';

-- CreateSequence
CREATE SEQUENCE "public"."manual_payment_reference_seq" START WITH 10001;

-- CreateTable
CREATE TABLE "public"."manual_payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "public"."payment_method" NOT NULL,
    "platform" "public"."manual_payment_platform" NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "phone_number" VARCHAR(30) NOT NULL,
    "instructions" VARCHAR(1000),
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."manual_payment_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(32) NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "public"."manual_payment_platform" NOT NULL,
    "installment_plan_id" UUID,
    "organiser_plan_id" UUID,
    "plan_snapshot" JSONB NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "payment_method_id" UUID,
    "payment_method_snapshot" JSONB NOT NULL,
    "receipt_upload_id" UUID NOT NULL,
    "status" "public"."manual_payment_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_payment_methods_platform_active_idx" ON "public"."manual_payment_methods"("platform", "is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_submissions_reference_key" ON "public"."manual_payment_submissions"("reference");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_user_idx" ON "public"."manual_payment_submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "manual_payment_submissions_status_idx" ON "public"."manual_payment_submissions"("status", "platform", "created_at");
