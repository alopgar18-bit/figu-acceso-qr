CREATE INDEX IF NOT EXISTS idx_checkins_session_id ON public.checkins (session_id);
CREATE INDEX IF NOT EXISTS idx_checkins_event_id ON public.checkins (event_id);

CREATE OR REPLACE FUNCTION public.dashboard_session_counts(_session_ids uuid[])
RETURNS TABLE(session_id uuid, solicitudes bigint, confirmados bigint, checkins bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.id,
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id),
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id AND ep.status IN ('confirmado','qr_generado','acceso_validado')),
    (SELECT count(*) FROM public.checkins c WHERE c.session_id = s.id)
  FROM unnest(_session_ids) AS s(id);
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_session_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_session_counts(uuid[]) TO authenticated;