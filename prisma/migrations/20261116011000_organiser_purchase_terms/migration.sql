ALTER TABLE "organiser_subscriptions" ADD COLUMN "plan_snapshot" JSONB NOT NULL DEFAULT '{}';
UPDATE "organiser_subscriptions" s SET "plan_snapshot" = jsonb_build_object('durationDays',p."duration_days",'postQuota',p."post_quota",'interval',p."interval",'name',p."name",'priceMinor',p."price_minor"::text,'currency',p."currency") FROM "organiser_plans" p WHERE s."plan_id"=p."id";
