ALTER TABLE "users" ADD COLUMN "admin_account_status" VARCHAR(20);
ALTER TABLE "service_subscriptions" ADD COLUMN "revoked_at" TIMESTAMPTZ(6), ADD COLUMN "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(), ADD COLUMN "price_minor" BIGINT, ADD COLUMN "permissions_snapshot" JSONB;
UPDATE "service_subscriptions" SET "starts_at"="created_at";
ALTER TABLE "payment_intents" ADD COLUMN "plan_snapshot" JSONB;
CREATE TABLE "findlove_admin_settings" ("id" TEXT PRIMARY KEY DEFAULT 'global', "revision" INTEGER NOT NULL DEFAULT 0, "permissions" JSONB NOT NULL);
INSERT INTO "findlove_admin_settings" ("id","permissions") VALUES ('global','{"public":{"public":true,"private":false},"private":{"public":true,"private":true}}');
INSERT INTO "installment_plans" ("id","account_type","interval","duration_days","price_minor","updated_at")
SELECT gen_random_uuid(), v.tier::find_love_account_type, v.period::installment_interval, v.days, v.price, NOW()
FROM (VALUES ('PUBLIC','WEEKLY',7,499),('PUBLIC','MONTHLY',30,999),('PUBLIC','YEARLY',365,9999),('PRIVATE','WEEKLY',7,999),('PRIVATE','MONTHLY',30,2499),('PRIVATE','YEARLY',365,24999)) AS v(tier,period,days,price)
WHERE NOT EXISTS (SELECT 1 FROM "installment_plans");
