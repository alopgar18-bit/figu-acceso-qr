
-- Incident type enum
DO $$ BEGIN
  CREATE TYPE public.incident_type AS ENUM (
    'qr_ya_usado',
    'qr_no_valido',
    'sin_dni',
    'dni_no_coincide',
    'no_aparece_lista',
    'no_confirmado',
    'acompanante_no_registrado',
    'menor_sin_autorizacion',
    'fuera_horario',
    'cambio_sesion',
    'vip_especial',
    'persona_bloqueada',
    'problema_tecnico',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS incident_type public.incident_type NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

CREATE INDEX IF NOT EXISTS idx_incidents_event ON public.incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_session ON public.incidents(session_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON public.incidents(incident_type);
