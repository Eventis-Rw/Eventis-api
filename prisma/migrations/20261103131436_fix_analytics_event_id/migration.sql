/*
  Warnings:

  - The primary key for the `analytics_events` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `analytics_events` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "public"."events" DROP CONSTRAINT "events_poster_id_fkey";

-- AlterTable
ALTER TABLE "public"."analytics_events" DROP CONSTRAINT "analytics_events_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_poster_id_fkey" FOREIGN KEY ("poster_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
