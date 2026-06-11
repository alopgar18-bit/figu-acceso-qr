
-- 1. Forms per attendee type
ALTER TABLE public.public_forms
  ADD COLUMN IF NOT EXISTS attendee_type attendee_type NOT NULL DEFAULT 'publico';

CREATE INDEX IF NOT EXISTS idx_public_forms_session ON public.public_forms(session_id);
CREATE INDEX IF NOT EXISTS idx_public_forms_attendee_type ON public.public_forms(attendee_type);

-- 2. Seat assignment on participants
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS seat_zone text,
  ADD COLUMN IF NOT EXISTS seat_row text,
  ADD COLUMN IF NOT EXISTS seat_number text;

CREATE INDEX IF NOT EXISTS idx_participants_seat
  ON public.event_participants(session_id, seat_row, seat_number)
  WHERE seat_row IS NOT NULL;
