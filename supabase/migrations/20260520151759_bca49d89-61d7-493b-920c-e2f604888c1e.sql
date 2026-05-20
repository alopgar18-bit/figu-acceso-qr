
-- 1. Columns
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS confirmation_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS cancellation_reason_by_attendee text;

-- 2. Token auto-fill trigger
CREATE OR REPLACE FUNCTION public.ensure_confirmation_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.confirmation_token IS NULL
     AND NEW.status IN ('aprobado','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado')
  THEN
    NEW.confirmation_token := encode(gen_random_bytes(24), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_confirmation_token ON public.event_participants;
CREATE TRIGGER trg_ensure_confirmation_token
BEFORE INSERT OR UPDATE ON public.event_participants
FOR EACH ROW EXECUTE FUNCTION public.ensure_confirmation_token();

-- Backfill existing approved-like participants
UPDATE public.event_participants
SET confirmation_token = encode(gen_random_bytes(24), 'hex')
WHERE confirmation_token IS NULL
  AND status IN ('aprobado','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado');

CREATE INDEX IF NOT EXISTS idx_event_participants_confirmation_token
  ON public.event_participants(confirmation_token);
