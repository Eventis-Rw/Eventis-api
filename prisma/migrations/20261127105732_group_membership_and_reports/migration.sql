-- CreateEnum
CREATE TYPE "public"."report_category" AS ENUM ('SPAM', 'HARASSMENT', 'IMPERSONATION', 'INAPPROPRIATE_CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."conversation_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."participant_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."participant_status" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'REMOVED', 'LEFT', 'BANNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."moderation_status" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "public"."moderation_status" ADD VALUE 'ACTIONED';

-- AlterTable
ALTER TABLE "public"."conversation_participants" ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "role" "public"."participant_role" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "status" "public"."participant_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "public"."conversations" ADD COLUMN     "avatar_key" VARCHAR(500),
ADD COLUMN     "category" VARCHAR(60),
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "invite_code" VARCHAR(40),
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "public"."conversation_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "public"."user_reports" ADD COLUMN     "assigned_to" UUID,
ADD COLUMN     "category" "public"."report_category",
ADD COLUMN     "moderator_notes" VARCHAR(4000),
ALTER COLUMN "reported_user_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "conversation_participants_status_idx" ON "public"."conversation_participants"("conversation_id", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_invite_code_key" ON "public"."conversations"("invite_code");

-- CreateIndex
CREATE INDEX "conversations_group_discovery_idx" ON "public"."conversations"("type", "is_public", "status");

-- CreateIndex
CREATE INDEX "user_reports_conversation_idx" ON "public"."user_reports"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_participants" ADD CONSTRAINT "conversation_participants_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_reports" ADD CONSTRAINT "user_reports_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_reports" ADD CONSTRAINT "user_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

