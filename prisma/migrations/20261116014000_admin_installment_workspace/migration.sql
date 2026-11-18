ALTER TABLE "event_installment_payments" ADD COLUMN "manual_method" VARCHAR(100);
CREATE TABLE "admin_installment_settings" ("id" TEXT PRIMARY KEY DEFAULT 'global',"revision" INTEGER NOT NULL DEFAULT 0);
INSERT INTO "admin_installment_settings" ("id") VALUES ('global');

-- Manual receipt references identify an external payment; case changes must not
-- allow the same receipt to be credited twice. Existing duplicates require
-- explicit reconciliation before this migration can be applied.
CREATE UNIQUE INDEX "event_installment_manual_reference_unique"
ON "event_installment_payments" (lower("transaction_reference"))
WHERE "source" = 'MANUAL' AND "transaction_reference" IS NOT NULL;
