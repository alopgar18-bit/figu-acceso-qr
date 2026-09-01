CREATE INDEX IF NOT EXISTS idx_comm_logs_activos_created_at
  ON public.communication_logs (created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_logs_status_created_at
  ON public.communication_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comm_logs_channel_created_at
  ON public.communication_logs (channel, created_at DESC);

ANALYZE public.communication_logs;