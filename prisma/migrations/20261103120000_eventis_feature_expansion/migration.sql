-- CreateEnum
CREATE TYPE "public"."poster_kind" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "public"."profile_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."moderation_status" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."payment_purpose" AS ENUM ('FINDLOVE', 'ORGANISER_PLAN', 'PROMOTION');

-- CreateEnum
CREATE TYPE "public"."organisation_verification_status" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."organisation_role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "public"."phone_verification_purpose" AS ENUM ('SETTINGS', 'PAYMENT', 'CHAT');

-- CreateEnum
CREATE TYPE "public"."notification_category" AS ENUM ('EVENTS', 'ACTIVITY', 'ORGANIZERS', 'FINDLOVE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."push_platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "public"."upload_purpose" AS ENUM ('VERIFICATION_DOC', 'SUPPORT_SCREENSHOT', 'ORG_LOGO', 'EVENT_IMAGE', 'LOVE_PHOTO', 'AGE_ID');

-- CreateEnum
CREATE TYPE "public"."upload_status" AS ENUM ('PENDING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "public"."support_category" AS ENUM ('EVENTS', 'PAYMENTS', 'ACCOUNT', 'SAFETY', 'BUG', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."support_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."deletion_channel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."organiser_plan_interval" AS ENUM ('PAY_PER_POST', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."organiser_subscription_status" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."business_verification_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."promotion_placement" AS ENUM ('HOME_BANNER', 'FEATURED', 'CATEGORY_HIGHLIGHT', 'NEARBY_PROMOTED', 'SPONSORED_AD');

-- CreateEnum
CREATE TYPE "public"."promotion_status" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."analytics_event_type" AS ENUM ('IMPRESSION', 'VIEW', 'CLICK', 'SAVE', 'SHARE', 'WEBSITE_CLICK');

-- CreateEnum
CREATE TYPE "public"."age_document_type" AS ENUM ('NATIONAL_ID', 'PASSPORT');

-- CreateEnum
CREATE TYPE "public"."age_verification_status" AS ENUM ('PROCESSING', 'MANUAL_REVIEW', 'VERIFIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."love_gender" AS ENUM ('MAN', 'WOMAN', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "public"."love_interested_in" AS ENUM ('WOMEN', 'MEN', 'EVERYONE');

-- CreateEnum
CREATE TYPE "public"."love_relationship_goal" AS ENUM ('FRIENDSHIP', 'LONG_TERM', 'SHORT_TERM', 'MARRIAGE', 'CASUAL', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "public"."love_connection_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'REMOVED');

-- AlterEnum
ALTER TYPE "public"."event_status" ADD VALUE 'paused';

-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "active_organisation_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "email_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_seen_at" TIMESTAMPTZ(6),
ADD COLUMN     "phone_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "poster_kind" "public"."poster_kind" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "profile_visibility" "public"."profile_visibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "terms_version" VARCHAR(20),
ADD COLUMN     "username" VARCHAR(30);

-- AlterTable
ALTER TABLE "public"."events" ADD COLUMN     "booking_url" VARCHAR(500),
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "category_id" UUID,
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "end_time" VARCHAR(20),
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "organisation_id" UUID,
ADD COLUMN     "price_minor" BIGINT,
ADD COLUMN     "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" VARCHAR(40) NOT NULL DEFAULT 'Africa/Kigali';

-- AlterTable
ALTER TABLE "public"."statuses" ADD COLUMN     "template_id" UUID;

-- AlterTable
ALTER TABLE "public"."conversation_participants" ADD COLUMN     "cleared_before_message_id" UUID,
ADD COLUMN     "hidden_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN     "forwarded_from_id" UUID;

-- AlterTable
ALTER TABLE "public"."message_attachments" ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "public"."payment_intents" ADD COLUMN     "purpose" "public"."payment_purpose" NOT NULL DEFAULT 'FINDLOVE',
ADD COLUMN     "reference_id" UUID,
ALTER COLUMN "installment_plan_id" DROP NOT NULL,
ALTER COLUMN "account_type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."user_reports" ADD COLUMN     "message_id" UUID,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by" UUID,
ADD COLUMN     "status" "public"."moderation_status" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "public"."saved_events" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("user_id","event_id")
);

-- CreateTable
CREATE TABLE "public"."saved_organisers" (
    "user_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_organisers_pkey" PRIMARY KEY ("user_id","organisation_id")
);

-- CreateTable
CREATE TABLE "public"."reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "activities" VARCHAR(300) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "website" VARCHAR(500),
    "logo_key" VARCHAR(500),
    "business_type" VARCHAR(80),
    "verification_status" "public"."organisation_verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organisation_members" (
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "public"."organisation_role" NOT NULL DEFAULT 'EDITOR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("organisation_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."publisher_profiles" (
    "user_id" UUID NOT NULL,
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(30),
    "website" VARCHAR(500),
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "legal_name" VARCHAR(160),
    "registration_number" VARCHAR(30),
    "tax_id_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "publisher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."publisher_profile_categories" (
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publisher_profile_categories_pkey" PRIMARY KEY ("user_id","category_id")
);

-- CreateTable
CREATE TABLE "public"."event_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "details" TEXT,
    "status" "public"."moderation_status" NOT NULL DEFAULT 'OPEN',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_notification_preferences" (
    "user_id" UUID NOT NULL,
    "event_recommendations" BOOLEAN NOT NULL DEFAULT true,
    "category_updates" BOOLEAN NOT NULL DEFAULT true,
    "event_updates" BOOLEAN NOT NULL DEFAULT true,
    "saved_organiser_updates" BOOLEAN NOT NULL DEFAULT true,
    "promotional" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."user_preferences" (
    "user_id" UUID NOT NULL,
    "preferred_location" VARCHAR(120),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "language" VARCHAR(10),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."user_preference_categories" (
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preference_categories_pkey" PRIMARY KEY ("user_id","category_id")
);

-- CreateTable
CREATE TABLE "public"."phone_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "purpose" "public"."phone_verification_purpose" NOT NULL DEFAULT 'SETTINGS',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category" "public"."notification_category" NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" "public"."push_platform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "purpose" "public"."upload_purpose" NOT NULL,
    "content_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."upload_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."support_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category" "public"."support_category" NOT NULL,
    "description" TEXT NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "reference" VARCHAR(80),
    "screenshot_key" VARCHAR(500),
    "diagnostics" JSONB NOT NULL DEFAULT '{}',
    "status" "public"."support_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."account_deletion_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" "public"."deletion_channel" NOT NULL DEFAULT 'SMS',
    "code_hash" VARCHAR(128) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organiser_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "interval" "public"."organiser_plan_interval" NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "duration_days" INTEGER NOT NULL,
    "post_quota" INTEGER,
    "features" JSONB NOT NULL DEFAULT '[]',
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "badge" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organiser_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organiser_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "public"."organiser_subscription_status" NOT NULL DEFAULT 'PENDING',
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "posts_remaining" INTEGER,
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organiser_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."business_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "legal_name" VARCHAR(160) NOT NULL,
    "registration_number" VARCHAR(30) NOT NULL,
    "tax_id_encrypted" TEXT NOT NULL,
    "representative_name" VARCHAR(160) NOT NULL,
    "payment_website" VARCHAR(500) NOT NULL,
    "document_key" VARCHAR(500) NOT NULL,
    "status" "public"."business_verification_status" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,

    CONSTRAINT "business_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "placement" "public"."promotion_placement" NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "status" "public"."promotion_status" NOT NULL DEFAULT 'REQUESTED',
    "price_minor" BIGINT,
    "payment_id" UUID,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "public"."analytics_event_type" NOT NULL,
    "source" VARCHAR(60),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_stats_daily" (
    "event_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "website_clicks" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_stats_daily_pkey" PRIMARY KEY ("event_id","date")
);

-- CreateTable
CREATE TABLE "public"."age_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "document_type" "public"."age_document_type" NOT NULL,
    "front_key" VARCHAR(500) NOT NULL,
    "back_key" VARCHAR(500),
    "adult_confirmed_at" TIMESTAMPTZ(6),
    "status" "public"."age_verification_status" NOT NULL DEFAULT 'PROCESSING',
    "rejection_reason" TEXT,
    "date_of_birth" DATE,
    "reviewed_by" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "age_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."love_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "gender" "public"."love_gender" NOT NULL,
    "interested_in" "public"."love_interested_in" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "country" VARCHAR(80) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "neighborhood" VARCHAR(80) NOT NULL,
    "occupation" VARCHAR(120),
    "bio" VARCHAR(160),
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationship_goal" "public"."love_relationship_goal",
    "looking_for" VARCHAR(120),
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "love_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."love_profile_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "love_profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."love_likes" (
    "from_profile_id" UUID NOT NULL,
    "to_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "love_likes_pkey" PRIMARY KEY ("from_profile_id","to_profile_id")
);

-- CreateTable
CREATE TABLE "public"."love_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "from_profile_id" UUID NOT NULL,
    "to_profile_id" UUID NOT NULL,
    "status" "public"."love_connection_status" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(500),
    "conversation_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "love_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contact_aliases" (
    "owner_id" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "contact_user_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_aliases_pkey" PRIMARY KEY ("owner_id","phone")
);

-- CreateIndex
CREATE INDEX "saved_events_event_idx" ON "public"."saved_events"("event_id");

-- CreateIndex
CREATE INDEX "saved_organisers_organisation_idx" ON "public"."saved_organisers"("organisation_id");

-- CreateIndex
CREATE INDEX "reviews_event_created_idx" ON "public"."reviews"("event_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_event_user_unique" ON "public"."reviews"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "organisations_owner_idx" ON "public"."organisations"("owner_id");

-- CreateIndex
CREATE INDEX "organisations_verification_idx" ON "public"."organisations"("verification_status");

-- CreateIndex
CREATE INDEX "organisations_name_idx" ON "public"."organisations"("name");

-- CreateIndex
CREATE INDEX "organisation_members_user_idx" ON "public"."organisation_members"("user_id");

-- CreateIndex
CREATE INDEX "publisher_profile_categories_category_idx" ON "public"."publisher_profile_categories"("category_id");

-- CreateIndex
CREATE INDEX "event_reports_event_idx" ON "public"."event_reports"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "event_reports_status_idx" ON "public"."event_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "user_preference_categories_category_idx" ON "public"."user_preference_categories"("category_id");

-- CreateIndex
CREATE INDEX "phone_verifications_user_purpose_idx" ON "public"."phone_verifications"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "phone_verifications_phone_purpose_idx" ON "public"."phone_verifications"("phone", "purpose");

-- CreateIndex
CREATE INDEX "notifications_user_read_idx" ON "public"."notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_created_idx" ON "public"."notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "public"."push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_user_idx" ON "public"."push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "uploads_user_purpose_idx" ON "public"."uploads"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "uploads_key_idx" ON "public"."uploads"("key");

-- CreateIndex
CREATE INDEX "support_reports_user_idx" ON "public"."support_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_reports_status_idx" ON "public"."support_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "account_deletion_challenges_user_idx" ON "public"."account_deletion_challenges"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organiser_plans_code_key" ON "public"."organiser_plans"("code");

-- CreateIndex
CREATE INDEX "organiser_plans_active_idx" ON "public"."organiser_plans"("active", "interval");

-- CreateIndex
CREATE UNIQUE INDEX "organiser_subscriptions_payment_id_key" ON "public"."organiser_subscriptions"("payment_id");

-- CreateIndex
CREATE INDEX "organiser_subscriptions_user_idx" ON "public"."organiser_subscriptions"("user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_verifications_organisation_id_key" ON "public"."business_verifications"("organisation_id");

-- CreateIndex
CREATE INDEX "business_verifications_status_idx" ON "public"."business_verifications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_payment_id_key" ON "public"."promotions"("payment_id");

-- CreateIndex
CREATE INDEX "promotions_event_status_idx" ON "public"."promotions"("event_id", "status");

-- CreateIndex
CREATE INDEX "promotions_status_placement_idx" ON "public"."promotions"("status", "placement");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_idx" ON "public"."analytics_events"("event_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_event_created_idx" ON "public"."analytics_events"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_user_idx" ON "public"."analytics_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "event_stats_daily_date_idx" ON "public"."event_stats_daily"("date");

-- CreateIndex
CREATE INDEX "age_verifications_user_idx" ON "public"."age_verifications"("user_id", "submitted_at");

-- CreateIndex
CREATE INDEX "age_verifications_status_idx" ON "public"."age_verifications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "love_profiles_user_id_key" ON "public"."love_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "love_profiles_username_key" ON "public"."love_profiles"("username");

-- CreateIndex
CREATE INDEX "love_profiles_discovery_idx" ON "public"."love_profiles"("country", "city", "is_hidden");

-- CreateIndex
CREATE INDEX "love_profiles_active_idx" ON "public"."love_profiles"("last_active_at");

-- CreateIndex
CREATE INDEX "love_profile_photos_profile_idx" ON "public"."love_profile_photos"("profile_id", "position");

-- CreateIndex
CREATE INDEX "love_likes_recipient_idx" ON "public"."love_likes"("to_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "love_connections_recipient_idx" ON "public"."love_connections"("to_profile_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "love_connections_sender_idx" ON "public"."love_connections"("from_profile_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "contact_aliases_owner_name_idx" ON "public"."contact_aliases"("owner_id", "first_name");

-- CreateIndex
CREATE INDEX "categories_active_position_idx" ON "public"."categories"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE INDEX "users_last_seen_idx" ON "public"."users"("last_seen_at");

-- CreateIndex
CREATE INDEX "events_category_id_idx" ON "public"."events"("category_id");

-- CreateIndex
CREATE INDEX "events_organisation_idx" ON "public"."events"("organisation_id");

-- CreateIndex
CREATE INDEX "events_city_idx" ON "public"."events"("city");

-- CreateIndex
CREATE INDEX "events_location_idx" ON "public"."events"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "payment_intents_purpose_reference_idx" ON "public"."payment_intents"("purpose", "reference_id");

-- CreateIndex
CREATE INDEX "user_reports_status_idx" ON "public"."user_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "user_reports_message_idx" ON "public"."user_reports"("message_id");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_active_organisation_id_fkey" FOREIGN KEY ("active_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_forwarded_from_id_fkey" FOREIGN KEY ("forwarded_from_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_reports" ADD CONSTRAINT "user_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_reports" ADD CONSTRAINT "user_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_events" ADD CONSTRAINT "saved_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_events" ADD CONSTRAINT "saved_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_organisers" ADD CONSTRAINT "saved_organisers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."saved_organisers" ADD CONSTRAINT "saved_organisers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organisations" ADD CONSTRAINT "organisations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organisation_members" ADD CONSTRAINT "organisation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."publisher_profiles" ADD CONSTRAINT "publisher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."publisher_profile_categories" ADD CONSTRAINT "publisher_profile_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."publisher_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."publisher_profile_categories" ADD CONSTRAINT "publisher_profile_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_reports" ADD CONSTRAINT "event_reports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_reports" ADD CONSTRAINT "event_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_reports" ADD CONSTRAINT "event_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preference_categories" ADD CONSTRAINT "user_preference_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preference_categories" ADD CONSTRAINT "user_preference_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."support_reports" ADD CONSTRAINT "support_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."account_deletion_challenges" ADD CONSTRAINT "account_deletion_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organiser_subscriptions" ADD CONSTRAINT "organiser_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organiser_subscriptions" ADD CONSTRAINT "organiser_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."organiser_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organiser_subscriptions" ADD CONSTRAINT "organiser_subscriptions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."business_verifications" ADD CONSTRAINT "business_verifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."business_verifications" ADD CONSTRAINT "business_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_stats_daily" ADD CONSTRAINT "event_stats_daily_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."age_verifications" ADD CONSTRAINT "age_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."age_verifications" ADD CONSTRAINT "age_verifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_profiles" ADD CONSTRAINT "love_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_profile_photos" ADD CONSTRAINT "love_profile_photos_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."love_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_likes" ADD CONSTRAINT "love_likes_from_profile_id_fkey" FOREIGN KEY ("from_profile_id") REFERENCES "public"."love_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_likes" ADD CONSTRAINT "love_likes_to_profile_id_fkey" FOREIGN KEY ("to_profile_id") REFERENCES "public"."love_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_connections" ADD CONSTRAINT "love_connections_from_profile_id_fkey" FOREIGN KEY ("from_profile_id") REFERENCES "public"."love_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_connections" ADD CONSTRAINT "love_connections_to_profile_id_fkey" FOREIGN KEY ("to_profile_id") REFERENCES "public"."love_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."love_connections" ADD CONSTRAINT "love_connections_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contact_aliases" ADD CONSTRAINT "contact_aliases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contact_aliases" ADD CONSTRAINT "contact_aliases_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

