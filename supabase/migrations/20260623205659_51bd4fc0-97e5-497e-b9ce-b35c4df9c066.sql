
-- 1. Enum de categorías de butaca
DO $$ BEGIN
  CREATE TYPE public.seat_override_category AS ENUM (
    'reservado_camaras',
    'bloqueado',
    'movilidad_reducida',
    'acompanante_mr',
    'visibilidad_reducida'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla de overrides por sesión
CREATE TABLE IF NOT EXISTS public.session_seat_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  seat_zone text NOT NULL,
  seat_row text NOT NULL,
  seat_number text NOT NULL,
  category public.seat_override_category NOT NULL,
  color text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT session_seat_overrides_unique UNIQUE (session_id, seat_zone, seat_row, seat_number)
);

CREATE INDEX IF NOT EXISTS session_seat_overrides_session_idx
  ON public.session_seat_overrides(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_seat_overrides TO authenticated;
GRANT ALL ON public.session_seat_overrides TO service_role;

ALTER TABLE public.session_seat_overrides ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado con acceso a la app puede leer overrides
CREATE POLICY "Authenticated can read seat overrides"
  ON public.session_seat_overrides FOR SELECT
  TO authenticated
  USING (true);

-- Escritura: admins (superadmin / admin_figurarte)
CREATE POLICY "Admins can insert seat overrides"
  ON public.session_seat_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update seat overrides"
  ON public.session_seat_overrides FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete seat overrides"
  ON public.session_seat_overrides FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER session_seat_overrides_set_updated_at
  BEFORE UPDATE ON public.session_seat_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
