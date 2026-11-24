-- DropForeignKey
ALTER TABLE "public"."external_identities" DROP CONSTRAINT "external_identities_user_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."external_identities" ADD CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
