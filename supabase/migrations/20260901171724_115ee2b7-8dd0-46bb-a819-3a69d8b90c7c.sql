CREATE OR REPLACE FUNCTION public.release_seat_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelado_asistente', 'cancelado_figurarte', 'rechazado')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.seat_zone := NULL;
    NEW.seat_row := NULL;
    NEW.seat_number := NULL;
    NEW.seat_locked := false;

    UPDATE public.companions
       SET seat_zone = NULL,
           seat_row = NULL,
           seat_number = NULL
     WHERE participant_id = NEW.id
       AND (seat_zone IS NOT NULL OR seat_row IS NOT NULL OR seat_number IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_seat_on_cancel ON public.event_participants;
CREATE TRIGGER trg_release_seat_on_cancel
BEFORE UPDATE ON public.event_participants
FOR EACH ROW
EXECUTE FUNCTION public.release_seat_on_cancel();