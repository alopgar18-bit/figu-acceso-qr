CREATE OR REPLACE FUNCTION public.session_summary_counts(_session_ids uuid[])
RETURNS TABLE(session_id uuid, solicitudes bigint, aprobados bigint, confirmados bigint, checkins bigint, asistentes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean := public.is_admin(auth.uid());
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH allowed AS (
    SELECT es.id, es.event_id
    FROM unnest(_session_ids) AS u(id)
    JOIN public.event_sessions es ON es.id = u.id
    WHERE _admin
       OR public.has_event_assignment(_uid, es.event_id, 'coordinador')
       OR public.has_event_assignment(_uid, es.event_id, 'validador')
       OR public.client_user_has_event(_uid, es.event_id)
  )
  SELECT s.id,
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id),
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id AND ep.status IN ('aprobado','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado','aceptado_pendiente_envio')),
    (SELECT count(*) FROM public.event_participants ep WHERE ep.session_id = s.id AND ep.status IN ('confirmado','qr_generado','acceso_validado')),
    (SELECT count(*) FROM public.checkins c WHERE c.session_id = s.id AND c.result = 'ok'),
    (SELECT coalesce(sum(1 + coalesce(c.companions_validated,0)),0) FROM public.checkins c WHERE c.session_id = s.id AND c.result = 'ok')::bigint
      + (SELECT coalesce(sum(1 + coalesce(i.walk_in_companions,0)),0) FROM public.incidents i
         WHERE i.session_id = s.id AND i.category = 'entrada'
           AND NOT (i.participant_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.checkins c2 WHERE c2.session_id = s.id AND c2.result = 'ok' AND c2.participant_id = i.participant_id)))::bigint
  FROM allowed s;
END;
$$;
REVOKE ALL ON FUNCTION public.session_summary_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_summary_counts(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_session_counts(uuid[]) FROM authenticated;
COMMENT ON FUNCTION public.dashboard_session_counts(uuid[]) IS 'DEPRECATED: replaced by session_summary_counts';