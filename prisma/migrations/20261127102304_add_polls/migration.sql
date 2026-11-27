-- AlterEnum
ALTER TYPE "public"."message_type" ADD VALUE 'POLL';

-- DropForeignKey
ALTER TABLE "public"."organiser_applications" DROP CONSTRAINT "organiser_applications_payment_fk";

-- DropForeignKey
ALTER TABLE "public"."organiser_applications" DROP CONSTRAINT "organiser_applications_user_fk";

-- CreateTable
CREATE TABLE "public"."polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."poll_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "text" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."poll_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "poll_option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polls_message_id_key" ON "public"."polls"("message_id");

-- CreateIndex
CREATE INDEX "poll_options_poll_idx" ON "public"."poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "poll_votes_option_idx" ON "public"."poll_votes"("poll_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_poll_user_key" ON "public"."poll_votes"("poll_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."polls" ADD CONSTRAINT "polls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."poll_votes" ADD CONSTRAINT "poll_votes_poll_option_id_fkey" FOREIGN KEY ("poll_option_id") REFERENCES "public"."poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organiser_applications" ADD CONSTRAINT "organiser_applications_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organiser_applications" ADD CONSTRAINT "organiser_applications_payment_fk" FOREIGN KEY ("manual_payment_id") REFERENCES "public"."manual_payment_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
