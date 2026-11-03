CREATE TYPE "find_love_account_type" AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE "installment_interval" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "payment_method" AS ENUM ('MTN_MOMO', 'AIRTEL_MONEY');
CREATE TYPE "payment_status" AS ENUM (
  'CREATED',
  'PROVIDER_REQUESTED',
  'AWAITING_USER',
  'UNKNOWN',
  'RECONCILING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
);

CREATE SEQUENCE "payment_reference_seq" START WITH 10001;

ALTER TABLE "service_subscriptions"
  ADD COLUMN "account_type" "find_love_account_type",
  ADD COLUMN "installment_plan_id" UUID,
  ADD COLUMN "payment_intent_id" UUID;

CREATE TABLE "installment_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_type" "find_love_account_type" NOT NULL,
  "interval" "installment_interval" NOT NULL,
  "duration_days" SMALLINT NOT NULL,
  "price_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference" VARCHAR(32) NOT NULL,
  "user_id" UUID NOT NULL,
  "installment_plan_id" UUID NOT NULL,
  "account_type" "find_love_account_type" NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
  "payment_method" "payment_method" NOT NULL,
  "phone_number" VARCHAR(30) NOT NULL,
  "status" "payment_status" NOT NULL DEFAULT 'CREATED',
  "provider" VARCHAR(30) NOT NULL,
  "provider_transaction_id" VARCHAR(128),
  "failure_reason" VARCHAR(500),
  "idempotency_key" VARCHAR(120),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "provider_requested_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(30) NOT NULL,
  "provider_event_id" VARCHAR(160) NOT NULL,
  "payment_intent_id" UUID,
  "event_type" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "signature_valid" BOOLEAN NOT NULL,
  "processed_at" TIMESTAMPTZ(6),
  "processing_error" VARCHAR(500),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "installment_plans_account_interval_unique"
  ON "installment_plans"("account_type", "interval");
CREATE INDEX "installment_plans_account_active_idx"
  ON "installment_plans"("account_type", "is_active");

CREATE UNIQUE INDEX "payment_intents_reference_key"
  ON "payment_intents"("reference");
CREATE UNIQUE INDEX "payment_intents_user_idempotency_unique"
  ON "payment_intents"("user_id", "idempotency_key");
CREATE INDEX "payment_intents_user_created_idx"
  ON "payment_intents"("user_id", "created_at");
CREATE INDEX "payment_intents_status_created_idx"
  ON "payment_intents"("status", "created_at");
CREATE INDEX "payment_intents_provider_transaction_idx"
  ON "payment_intents"("provider_transaction_id");

CREATE UNIQUE INDEX "provider_webhook_events_provider_event_unique"
  ON "provider_webhook_events"("provider", "provider_event_id");
CREATE INDEX "provider_webhook_events_payment_idx"
  ON "provider_webhook_events"("payment_intent_id", "received_at");

CREATE UNIQUE INDEX "service_subscriptions_payment_intent_id_key"
  ON "service_subscriptions"("payment_intent_id");
CREATE INDEX "service_subscriptions_account_lookup_idx"
  ON "service_subscriptions"("user_id", "service", "account_type", "expires_at");

ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_installment_plan_id_fkey"
  FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_webhook_events"
  ADD CONSTRAINT "provider_webhook_events_payment_intent_id_fkey"
  FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_subscriptions"
  ADD CONSTRAINT "service_subscriptions_installment_plan_id_fkey"
  FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_subscriptions"
  ADD CONSTRAINT "service_subscriptions_payment_intent_id_fkey"
  FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
