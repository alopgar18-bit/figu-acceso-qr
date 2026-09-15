-- Índices para los filtros reales de la cola de comunicaciones
CREATE INDEX IF NOT EXISTS idx_comm_logs_channel_status_sent_at
  ON public.communication_logs (channel, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_logs_channel_status_created_at
  ON public.communication_logs (channel, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_status
  ON public.event_participants (event_id, status);

CREATE INDEX IF NOT EXISTS idx_event_participants_session_status
  ON public.event_participants (session_id, status);

-- Estado de la cola de WhatsApp en una sola llamada (antes: 7 consultas cada 5 s)
CREATE OR REPLACE FUNCTION public.whatsapp_queue_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _channels communication_channel[] := ARRAY['whatsapp_business','whatsapp_asistido']::communication_channel[];
  _since2h timestamptz := now() - interval '2 hours';
  _since24h timestamptz := now() - interval '24 hours';
  _since5m timestamptz := now() - interval '5 minutes';
  _lock record;
  _spam record;
  _result jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.has_any_role(_uid, ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT acquired_at, expires_at INTO _lock
  FROM public.whatsapp_drain_locks WHERE lock_key = 'wati_drain';

  SELECT acquired_at, expires_at INTO _spam
  FROM public.whatsapp_drain_locks WHERE lock_key = 'wati_spam_pause';

  SELECT jsonb_build_object(
    'lockAcquiredAt', _lock.acquired_at,
    'lockExpiresAt', _lock.expires_at,
    'lockActive', COALESCE(_lock.expires_at > now(), false),
    'spamPauseUntil', _spam.expires_at,
    'spamPauseActive', COALESCE(_spam.expires_at > now(), false),
    'pending', COUNT(*) FILTER (WHERE status = 'pendiente'),
    'sentRecent', COUNT(*) FILTER (WHERE status = 'enviado' AND sent_at >= _since2h),
    'failedRecent', COUNT(*) FILTER (WHERE status = 'fallido' AND created_at >= _since2h),
    'spamFailedRecent', COUNT(*) FILTER (
      WHERE status = 'fallido' AND created_at >= _since24h
        AND whatsapp_failed_detail ILIKE '%Spam Rate limit hit%'),
    'sentLast5', COUNT(*) FILTER (WHERE status = 'enviado' AND sent_at >= _since5m),
    'lastSentAt', MAX(sent_at) FILTER (WHERE status = 'enviado')
  )
  INTO _result
  FROM public.communication_logs
  WHERE channel = ANY(_channels);

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_queue_status() TO authenticated;
