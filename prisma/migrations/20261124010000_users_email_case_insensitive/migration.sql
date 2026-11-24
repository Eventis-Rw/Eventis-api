-- Abort rather than merge or delete accounts if historical collisions exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Case-insensitive duplicate emails exist. Resolve account ownership before applying this migration.';
  END IF;
END $$;
UPDATE users SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));
CREATE UNIQUE INDEX users_email_ci_unique ON users (lower(btrim(email))) WHERE email IS NOT NULL;
