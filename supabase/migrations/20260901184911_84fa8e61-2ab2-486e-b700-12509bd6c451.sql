CREATE TABLE public.released_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid REFERENCES public.event_participants(id) ON DELETE SET NULL,
  session_id uuid,
  event_id uuid,
  seat_zone text,
  seat_row text,
  seat_number text,
  holder_name text,
  is_companion boolean NOT NULL DEFAULT false,
  released_reason text,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.released_seats TO authenticated;
GRANT ALL ON public.released_seats TO service_role;

ALTER TABLE public.released_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal autenticado consulta butacas liberadas"
ON public.released_seats FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_released_seats_session ON public.released_seats(session_id, released_at DESC);

CREATE OR REPLACE FUNCTION public.release_seat_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelado_asistente', 'cancelado_figurarte', 'rechazado')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    IF NEW.seat_zone IS NOT NULL OR NEW.seat_row IS NOT NULL OR NEW.seat_number IS NOT NULL THEN
      INSERT INTO public.released_seats (participant_id, session_id, event_id, seat_zone, seat_row, seat_number, holder_name, is_companion, released_reason)
      SELECT NEW.id, NEW.session_id, NEW.event_id, NEW.seat_zone, NEW.seat_row, NEW.seat_number,
             trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), false, NEW.status::text
        FROM public.people p WHERE p.id = NEW.person_id;
    END IF;

    INSERT INTO public.released_seats (participant_id, session_id, event_id, seat_zone, seat_row, seat_number, holder_name, is_companion, released_reason)
    SELECT NEW.id, NEW.session_id, NEW.event_id, c.seat_zone, c.seat_row, c.seat_number,
           trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), true, NEW.status::text
      FROM public.companions c
     WHERE c.participant_id = NEW.id
       AND (c.seat_zone IS NOT NULL OR c.seat_row IS NOT NULL OR c.seat_number IS NOT NULL);

    NEW.seat_zone := NULL;
    NEW.seat_row := NULL;
    NEW.seat_number := NULL;
    NEW.seat_locked := false;

    UPDATE public.companions
       SET seat_zone = NULL, seat_row = NULL, seat_number = NULL
     WHERE participant_id = NEW.id
       AND (seat_zone IS NOT NULL OR seat_row IS NOT NULL OR seat_number IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$$;