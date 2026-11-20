ALTER TABLE "organiser_plans" ADD COLUMN "frontend_id" VARCHAR(100), ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "prices" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "organiser_plans" ALTER COLUMN "code" TYPE VARCHAR(100), ALTER COLUMN "badge" TYPE VARCHAR(80);
CREATE UNIQUE INDEX "organiser_plans_frontend_id_key" ON "organiser_plans"("frontend_id");
CREATE TABLE "organiser_catalog_settings" ("id" TEXT PRIMARY KEY DEFAULT 'global', "revision" INTEGER NOT NULL DEFAULT 0, "payment_methods" JSONB NOT NULL DEFAULT '["mtn_momo","airtel_money"]');
INSERT INTO "organiser_catalog_settings" ("id") VALUES ('global');
