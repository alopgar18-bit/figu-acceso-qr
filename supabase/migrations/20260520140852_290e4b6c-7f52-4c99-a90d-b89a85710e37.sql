-- Add 'otro' to event_type if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'otro' AND enumtypid = 'event_type'::regtype) THEN
    ALTER TYPE event_type ADD VALUE 'otro';
  END IF;
END $$;

-- QR mode for companions
DO $$ BEGIN
  CREATE TYPE companions_qr_mode AS ENUM ('mismo_qr', 'qr_propio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS public_registration_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_can_choose_session boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_min_age integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_waitlist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_allow_companions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_max_companions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_companions_qr_mode companions_qr_mode NOT NULL DEFAULT 'mismo_qr',
  ADD COLUMN IF NOT EXISTS general_instructions text;

-- Extend event_sessions
ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS max_validators integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS public_form_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_selectable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_age integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companions_qr_mode companions_qr_mode NOT NULL DEFAULT 'mismo_qr',
  ADD COLUMN IF NOT EXISTS specific_instructions text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_client ON public.events(client_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON public.event_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_starts_at ON public.event_sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_event_participants_session ON public.event_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_status ON public.event_participants(status);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_sessions_updated_at ON public.event_sessions;
CREATE TRIGGER trg_event_sessions_updated_at BEFORE UPDATE ON public.event_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();