-- Extensions for scheduled ticks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Job status enum
DO $$ BEGIN
  CREATE TYPE public.background_job_status AS ENUM (
    'queued','running','done','failed','paused','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.background_job_status NOT NULL DEFAULT 'queued',
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  lock_owner text,
  lock_expires_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3
);

CREATE INDEX IF NOT EXISTS bg_jobs_status_created_idx ON public.background_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS bg_jobs_created_by_idx ON public.background_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS bg_jobs_kind_status_idx ON public.background_jobs (kind, status);

-- Grants
GRANT SELECT, INSERT ON public.background_jobs TO authenticated;
GRANT UPDATE (status) ON public.background_jobs TO authenticated;
GRANT ALL ON public.background_jobs TO service_role;

-- RLS
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bg_jobs_select_own_or_admin" ON public.background_jobs;
CREATE POLICY "bg_jobs_select_own_or_admin"
  ON public.background_jobs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "bg_jobs_insert_own" ON public.background_jobs;
CREATE POLICY "bg_jobs_insert_own"
  ON public.background_jobs FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "bg_jobs_cancel_own_or_admin" ON public.background_jobs;
CREATE POLICY "bg_jobs_cancel_own_or_admin"
  ON public.background_jobs FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_bg_jobs_updated_at ON public.background_jobs;
CREATE TRIGGER trg_bg_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic claim function
CREATE OR REPLACE FUNCTION public.claim_next_background_job(_owner text, _kinds text[] DEFAULT NULL, _lock_seconds int DEFAULT 120)
RETURNS public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.background_jobs;
BEGIN
  UPDATE public.background_jobs bj
     SET status = 'running',
         lock_owner = _owner,
         lock_expires_at = now() + make_interval(secs => _lock_seconds),
         started_at = COALESCE(bj.started_at, now()),
         attempts = bj.attempts + 1
   WHERE bj.id = (
     SELECT id FROM public.background_jobs
      WHERE (status = 'queued'
             OR (status = 'running' AND (lock_expires_at IS NULL OR lock_expires_at < now())))
        AND (_kinds IS NULL OR kind = ANY(_kinds))
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
   RETURNING bj.* INTO _job;
  RETURN _job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_background_job(text, text[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_background_job(text, text[], int) TO service_role;