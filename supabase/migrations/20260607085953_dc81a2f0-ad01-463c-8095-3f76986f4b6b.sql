
-- Drop anon-facing policy on base table
DROP POLICY IF EXISTS sessions_public_select ON public.event_sessions;

-- Public view exposing only safe columns for published events
DROP VIEW IF EXISTS public.event_sessions_public;
CREATE VIEW public.event_sessions_public
WITH (security_invoker = off) AS
SELECT
  s.id,
  s.event_id,
  s.name,
  s.description,
  s.starts_at,
  s.ends_at,
  s.doors_open_at,
  s.location_name,
  s.location_address,
  s.capacity,
  s.status,
  s.allow_companions,
  s.max_companions_per_participant,
  s.companions_qr_mode,
  s.min_age,
  s.user_selectable,
  s.public_form_enabled,
  s.waitlist_enabled,
  s.inherit_event_fields,
  s.field_requirements,
  s.created_at,
  s.updated_at
FROM public.event_sessions s
WHERE EXISTS (
  SELECT 1 FROM public.events e
  WHERE e.id = s.event_id AND e.status = 'publicado'
);

GRANT SELECT ON public.event_sessions_public TO anon, authenticated;
