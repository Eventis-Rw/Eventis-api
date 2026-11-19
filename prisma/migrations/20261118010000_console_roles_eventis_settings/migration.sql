CREATE TABLE "console_roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL UNIQUE,
  "permissions" TEXT[] NOT NULL
);
ALTER TABLE "users" ADD COLUMN "console_role_id" UUID REFERENCES "console_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_console_role_idx" ON "users" ("console_role_id");

CREATE TABLE "eventis_global_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'global' CHECK ("id" = 'global'),
  "display_name" VARCHAR(80) NOT NULL DEFAULT 'Eventis',
  "support_email" VARCHAR(254),
  "announcement" VARCHAR(500),
  "revision" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "eventis_global_settings" ("id") VALUES ('global');
