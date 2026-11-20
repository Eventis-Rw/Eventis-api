-- AlterTable
ALTER TABLE "public"."event_installment_schedules" ADD COLUMN     "is_initial_payment" BOOLEAN NOT NULL DEFAULT false;
