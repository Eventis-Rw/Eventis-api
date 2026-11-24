ALTER TABLE "users" ADD COLUMN "admin_password_hash" VARCHAR(255);
CREATE TABLE "admin_login_rate_limits" (
  "key" VARCHAR(80) PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "admin_login_rate_limits_expires_at_idx" ON "admin_login_rate_limits"("expires_at");
