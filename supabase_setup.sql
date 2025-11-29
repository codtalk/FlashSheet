-- supabase_setup.sql - Idempotent schema & maintenance for Cardcard
-- Run each block separately in Supabase SQL editor if needed.

------------------------------
-- 1. Inspect current state --
------------------------------
-- Existing constraints & indexes on users
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'users';

-- Existing indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='users';

-- Check duplicate usernames (must be empty before adding UNIQUE)
SELECT username, count(*) AS cnt
FROM public.users
GROUP BY username
HAVING count(*) > 1;

---------------------------------
-- 2. Resolve duplicate rows     --
---------------------------------
-- If the above query returns rows, merge them first. Example strategy:
-- Keep the row with highest best_streak OR latest last_active; delete others.
-- Preview which rows would be kept:
WITH ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (PARTITION BY username ORDER BY best_streak DESC, last_active DESC NULLS LAST) AS rn
  FROM public.users
)
SELECT * FROM ranked WHERE rn=1;  -- rows to keep

-- Delete duplicates leaving one (UNSAFE: review before running!)
-- DO $$ BEGIN
--   WITH ranked AS (
--     SELECT ctid, username,
--            ROW_NUMBER() OVER (PARTITION BY username ORDER BY best_streak DESC, last_active DESC NULLS LAST) AS rn
--     FROM public.users
--   )
--   DELETE FROM public.users u USING ranked r
--   WHERE u.ctid = r.ctid AND r.rn > 1;  -- remove extras
-- END $$;

-- Optional: consolidate streak values (if you want max values carried over) BEFORE deletion:
-- UPDATE public.users SET
--   streak_count = sub.max_streak,
--   best_streak  = GREATEST(best_streak, sub.max_best)
-- FROM (
--   SELECT username,
--          MAX(streak_count) AS max_streak,
--          MAX(best_streak)  AS max_best
--   FROM public.users GROUP BY username
-- ) sub
-- WHERE public.users.username = sub.username;

---------------------------------------------------------
-- 3. Add / ensure unique index (preferred over constraint)
---------------------------------------------------------
-- Safer: create unique index IF NOT EXISTS (Postgres already supports this for indexes)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON public.users (username);

-- (Optional) If you insist on a table constraint and it doesn't exist:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

---------------------------------------------------
-- 4. Ensure streak columns exist & are normalized --
---------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_count INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS best_streak INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
ALTER TABLE public.users ALTER COLUMN streak_count SET DEFAULT 0;
ALTER TABLE public.users ALTER COLUMN best_streak SET DEFAULT 0;
UPDATE public.users SET streak_count = 0 WHERE streak_count IS NULL;
UPDATE public.users SET best_streak = COALESCE(best_streak, streak_count, 0);
ALTER TABLE public.users ALTER COLUMN streak_count SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN best_streak SET NOT NULL;

-- Constraint: best_streak >= streak_count
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_best_ge_streak') THEN
    ALTER TABLE public.users DROP CONSTRAINT users_best_ge_streak;
  END IF;
  ALTER TABLE public.users ADD CONSTRAINT users_best_ge_streak CHECK (best_streak >= streak_count);
END $$;

---------------------------------------------
-- 5. RLS policies (choose ENABLE or DISABLE) --
---------------------------------------------
-- Option A: Disable RLS for simplicity
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Option B: Enable RLS with open policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_all') THEN
    DROP POLICY users_select_all ON public.users; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_insert_any') THEN
    DROP POLICY users_insert_any ON public.users; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_update_any') THEN
    DROP POLICY users_update_any ON public.users; END IF;
END $$;
CREATE POLICY users_select_all ON public.users FOR SELECT USING (true);
CREATE POLICY users_insert_any ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY users_update_any ON public.users FOR UPDATE USING (true) WITH CHECK (true);

-------------------------------
-- 6. Grants for anon role    --
-------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;

-----------------------------------------
-- 7. Test queries (run separately)    --
-----------------------------------------
-- Read single user
-- SELECT username, streak_count, best_streak, last_active FROM public.users WHERE username='thienpahm';

-- Manual streak increment (example)
-- UPDATE public.users
--   SET streak_count = streak_count + 1,
--       best_streak = GREATEST(best_streak, streak_count + 1),
--       last_active = NOW()
-- WHERE username='thienpahm';

-- End of script
