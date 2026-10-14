-- Keep event records when preventing deletion of their creator. Restricting the
-- parent delete avoids cascading a user cleanup into irreversible event loss.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_poster_id_fkey";
ALTER TABLE "events"
  ADD CONSTRAINT "events_poster_id_fkey"
  FOREIGN KEY ("poster_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
