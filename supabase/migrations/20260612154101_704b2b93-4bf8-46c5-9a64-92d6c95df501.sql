
-- Companion seats (optional)
ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS seat_zone   text,
  ADD COLUMN IF NOT EXISTS seat_row    text,
  ADD COLUMN IF NOT EXISTS seat_number text;

-- Link tickets to companions (qr_propio mode)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS companion_id uuid REFERENCES public.companions(id) ON DELETE SET NULL;

-- Allow multiple active tickets per participant (titular + N companions in qr_propio)
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_participant_id_key;
CREATE INDEX IF NOT EXISTS idx_tickets_participant ON public.tickets(participant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_companion   ON public.tickets(companion_id) WHERE companion_id IS NOT NULL;
