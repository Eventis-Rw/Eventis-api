ALTER TABLE "event_installment_plans" ADD COLUMN "admin_terms" JSONB;
ALTER TABLE "event_installment_agreements" ALTER COLUMN "event_id" DROP NOT NULL, ADD COLUMN "admin_terms" JSONB, ADD COLUMN "product_id" VARCHAR(100), ADD COLUMN "product_name" VARCHAR(200) NOT NULL DEFAULT 'Custom purchase', ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "event_installment_schedules" ADD COLUMN "display_number" INTEGER;
