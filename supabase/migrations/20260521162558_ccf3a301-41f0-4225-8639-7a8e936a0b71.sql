ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS inherit_event_fields boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;