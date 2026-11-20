ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
CREATE TABLE "external_identities" (
  "provider" VARCHAR(20) NOT NULL, "subject" VARCHAR(255) NOT NULL,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("provider", "subject")
);
CREATE INDEX "external_identities_user_id_idx" ON "external_identities"("user_id");
CREATE TABLE "email_sign_in_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "email" VARCHAR(255) NOT NULL,
  "code_hash" VARCHAR(128) NOT NULL, "username" VARCHAR(100), "purpose" VARCHAR(20) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "email_sign_in_codes_email_created_at_idx" ON "email_sign_in_codes"("email", "created_at");
