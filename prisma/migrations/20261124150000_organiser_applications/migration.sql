CREATE TYPE "organiser_application_status" AS ENUM ('PENDING_PAYMENT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "organiser_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "status" "organiser_application_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "name" VARCHAR(80) NOT NULL,
  "description" TEXT NOT NULL,
  "activities" VARCHAR(300) NOT NULL,
  "location" VARCHAR(120) NOT NULL,
  "website" VARCHAR(500),
  "manual_payment_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "reviewed_at" TIMESTAMPTZ(6),
  "reviewed_by" UUID,
  "rejection_reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organiser_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organiser_applications_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "organiser_applications_payment_fk" FOREIGN KEY ("manual_payment_id") REFERENCES "manual_payment_submissions"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "organiser_applications_manual_payment_id_key" ON "organiser_applications"("manual_payment_id");
CREATE UNIQUE INDEX "organiser_applications_one_open_per_user" ON "organiser_applications"("user_id") WHERE "status" IN ('PENDING_PAYMENT', 'IN_REVIEW');
CREATE INDEX "organiser_applications_user_idx" ON "organiser_applications"("user_id", "created_at");
CREATE INDEX "organiser_applications_status_idx" ON "organiser_applications"("status", "created_at");

ALTER TABLE "manual_payment_submissions"
  ADD COLUMN "verified_provider" "payment_method",
  ADD COLUMN "verified_transaction_id" VARCHAR(160);
CREATE UNIQUE INDEX "manual_payment_verified_transaction_unique"
  ON "manual_payment_submissions"("verified_provider", "verified_transaction_id");
