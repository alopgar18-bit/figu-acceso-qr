
-- 1. Track form origin directly on participant (denormalized for fast filtering)
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS public_form_id uuid REFERENCES public.public_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_participants_public_form_id
  ON public.event_participants(public_form_id);

-- Backfill existing rows from submission → form_id (only if matches a public_form)
UPDATE public.event_participants ep
SET public_form_id = pf.id
FROM public.form_submissions fs
JOIN public.public_forms pf ON pf.id = fs.form_id
WHERE ep.submission_id = fs.id
  AND ep.public_form_id IS NULL;

-- 2. Filter config on event assignments (e.g. restrict client to specific forms)
ALTER TABLE public.event_assignments
  ADD COLUMN IF NOT EXISTS filter_config jsonb NOT NULL DEFAULT '{}'::jsonb;
