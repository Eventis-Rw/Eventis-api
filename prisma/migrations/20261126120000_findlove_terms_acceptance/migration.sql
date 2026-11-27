ALTER TABLE "age_verifications"
ADD COLUMN "terms_version" VARCHAR(20),
ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(6);
