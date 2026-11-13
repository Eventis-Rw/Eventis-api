-- CreateEnum
CREATE TYPE "public"."event_installment_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."event_installment_initial_payment_type" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "public"."event_installment_late_fee_type" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "public"."event_installment_late_fee_status" AS ENUM ('APPLIED', 'WAIVED');

-- CreateEnum
CREATE TYPE "public"."event_installment_agreement_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'OVERDUE', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."event_installment_schedule_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."event_installment_payment_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "public"."event_installment_payment_source" AS ENUM ('PROVIDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."event_installment_refund_status" AS ENUM ('REQUESTED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."event_installment_notification_channel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."event_installment_notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."event_installment_notification_type" AS ENUM ('PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'UPCOMING_REMINDER', 'DUE_REMINDER', 'OVERDUE_NOTICE', 'LATE_FEE_APPLIED', 'REFUND_COMPLETED', 'AGREEMENT_COMPLETED');

-- AlterEnum
ALTER TYPE "public"."payment_purpose" ADD VALUE 'EVENT_INSTALLMENT';

-- DropIndex
DROP INDEX "public"."events_title_trgm_idx";

-- CreateTable
CREATE TABLE "public"."event_installment_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "frequency" "public"."event_installment_frequency" NOT NULL,
    "interval_count" SMALLINT NOT NULL DEFAULT 1,
    "installment_count" SMALLINT NOT NULL,
    "initial_payment_type" "public"."event_installment_initial_payment_type" NOT NULL DEFAULT 'FIXED',
    "initial_payment_value" BIGINT NOT NULL DEFAULT 0,
    "interest_rate_bps" SMALLINT NOT NULL DEFAULT 0,
    "late_fee_type" "public"."event_installment_late_fee_type" NOT NULL DEFAULT 'FIXED',
    "late_fee_value" BIGINT NOT NULL DEFAULT 0,
    "grace_period_days" SMALLINT NOT NULL DEFAULT 0,
    "allow_partial_payment" BOOLEAN NOT NULL DEFAULT true,
    "allow_early_payment" BOOLEAN NOT NULL DEFAULT true,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "plan_id" UUID,
    "total_amount_minor" BIGINT NOT NULL,
    "initial_payment_minor" BIGINT NOT NULL,
    "interest_amount_minor" BIGINT NOT NULL,
    "total_payable_minor" BIGINT NOT NULL,
    "amount_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "late_fees_total_minor" BIGINT NOT NULL DEFAULT 0,
    "outstanding_balance_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "frequency" "public"."event_installment_frequency" NOT NULL,
    "interval_count" SMALLINT NOT NULL DEFAULT 1,
    "installment_count" SMALLINT NOT NULL,
    "grace_period_days" SMALLINT NOT NULL DEFAULT 0,
    "late_fee_type" "public"."event_installment_late_fee_type" NOT NULL DEFAULT 'FIXED',
    "late_fee_value" BIGINT NOT NULL DEFAULT 0,
    "allow_partial_payment" BOOLEAN NOT NULL DEFAULT true,
    "allow_early_payment" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "status" "public"."event_installment_agreement_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_installment_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreement_id" UUID NOT NULL,
    "installment_number" SMALLINT NOT NULL,
    "due_date" TIMESTAMPTZ(6) NOT NULL,
    "principal_amount_minor" BIGINT NOT NULL,
    "interest_amount_minor" BIGINT NOT NULL,
    "late_fee_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_due_minor" BIGINT NOT NULL,
    "amount_paid_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "outstanding_amount_minor" BIGINT NOT NULL,
    "status" "public"."event_installment_schedule_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_installment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreement_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "payment_intent_id" UUID,
    "source" "public"."event_installment_payment_source" NOT NULL DEFAULT 'PROVIDER',
    "amount_minor" BIGINT NOT NULL,
    "refunded_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "paymentMethod" "public"."payment_method",
    "transaction_reference" VARCHAR(128),
    "status" "public"."event_installment_payment_status" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "installment_payment_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "public"."event_installment_refund_status" NOT NULL DEFAULT 'REQUESTED',
    "provider_refund_reference" VARCHAR(128),
    "rejection_reason" VARCHAR(500),
    "processed_by" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_installment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_late_fees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreement_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "feeType" "public"."event_installment_late_fee_type" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "public"."event_installment_late_fee_status" NOT NULL DEFAULT 'APPLIED',
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waived_at" TIMESTAMPTZ(6),
    "waived_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_installment_late_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "agreement_id" UUID,
    "schedule_id" UUID,
    "notification_type" "public"."event_installment_notification_type" NOT NULL,
    "channels" "public"."event_installment_notification_channel"[],
    "status" "public"."event_installment_notification_status" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_installment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_installment_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entityId" UUID NOT NULL,
    "previous_values" JSONB,
    "newValues" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_installment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_installment_plans_active_idx" ON "public"."event_installment_plans"("is_active");

-- CreateIndex
CREATE INDEX "event_installment_agreements_customer_idx" ON "public"."event_installment_agreements"("customer_id", "status");

-- CreateIndex
CREATE INDEX "event_installment_agreements_event_idx" ON "public"."event_installment_agreements"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_installment_agreements_status_idx" ON "public"."event_installment_agreements"("status", "updated_at");

-- CreateIndex
CREATE INDEX "event_installment_schedules_due_status_idx" ON "public"."event_installment_schedules"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_installment_schedules_agreement_number_unique" ON "public"."event_installment_schedules"("agreement_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "event_installment_payments_payment_intent_id_key" ON "public"."event_installment_payments"("payment_intent_id");

-- CreateIndex
CREATE INDEX "event_installment_payments_agreement_idx" ON "public"."event_installment_payments"("agreement_id", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_payments_schedule_idx" ON "public"."event_installment_payments"("schedule_id", "status");

-- CreateIndex
CREATE INDEX "event_installment_payments_customer_idx" ON "public"."event_installment_payments"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_payments_status_idx" ON "public"."event_installment_payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_refunds_status_idx" ON "public"."event_installment_refunds"("status", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_late_fees_agreement_idx" ON "public"."event_installment_late_fees"("agreement_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_installment_late_fees_schedule_type_unique" ON "public"."event_installment_late_fees"("schedule_id", "feeType");

-- CreateIndex
CREATE INDEX "event_installment_notifications_customer_idx" ON "public"."event_installment_notifications"("customer_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_notifications_agreement_idx" ON "public"."event_installment_notifications"("agreement_id", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_audit_logs_entity_idx" ON "public"."event_installment_audit_logs"("entity_type", "entityId", "created_at");

-- CreateIndex
CREATE INDEX "event_installment_audit_logs_actor_idx" ON "public"."event_installment_audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."event_installment_agreements" ADD CONSTRAINT "event_installment_agreements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_agreements" ADD CONSTRAINT "event_installment_agreements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_agreements" ADD CONSTRAINT "event_installment_agreements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."event_installment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_schedules" ADD CONSTRAINT "event_installment_schedules_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."event_installment_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_payments" ADD CONSTRAINT "event_installment_payments_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."event_installment_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_payments" ADD CONSTRAINT "event_installment_payments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."event_installment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_payments" ADD CONSTRAINT "event_installment_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_payments" ADD CONSTRAINT "event_installment_payments_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_refunds" ADD CONSTRAINT "event_installment_refunds_installment_payment_id_fkey" FOREIGN KEY ("installment_payment_id") REFERENCES "public"."event_installment_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_refunds" ADD CONSTRAINT "event_installment_refunds_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_late_fees" ADD CONSTRAINT "event_installment_late_fees_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."event_installment_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_late_fees" ADD CONSTRAINT "event_installment_late_fees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."event_installment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_late_fees" ADD CONSTRAINT "event_installment_late_fees_waived_by_fkey" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_notifications" ADD CONSTRAINT "event_installment_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_notifications" ADD CONSTRAINT "event_installment_notifications_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."event_installment_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_notifications" ADD CONSTRAINT "event_installment_notifications_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."event_installment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_installment_audit_logs" ADD CONSTRAINT "event_installment_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
