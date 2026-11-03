CREATE INDEX IF NOT EXISTS idx_checkins_session_result ON public.checkins (session_id, result);
CREATE INDEX IF NOT EXISTS idx_incidents_session_category ON public.incidents (session_id, category);

CREATE OR REPLACE FUNCTION public.session_summary_counts(_session_ids uuid[])
RETURNS TABLE(session_id uuid, solicitudes bigint, aprobados bigint, confirmados bigint, checkins bigint, asistentes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_any_assignment(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.id,
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id),
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id AND ep.status IN ('aprobado','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado','aceptado_pendiente_envio')),
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id AND ep.status IN ('confirmado','qr_generado','acceso_validado')),
    (SELECT count(*) FROM public.checkins c WHERE c.session_id = s.id AND c.result = 'ok'),
    (SELECT coalesce(sum(1 + coalesce(c.companions_validated,0)),0) FROM public.checkins c WHERE c.session_id = s.id AND c.result = 'ok')::bigint
      + (SELECT coalesce(sum(1 + coalesce(i.walk_in_companions,0)),0) FROM public.incidents i WHERE i.session_id = s.id AND i.category = 'entrada' AND i.status <> 'descartada')::bigint
  FROM unnest(_session_ids) AS s(id);
END;
$$;
REVOKE ALL ON FUNCTION public.session_summary_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_summary_counts(uuid[]) TO authenticated;