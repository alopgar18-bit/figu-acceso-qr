ALTER TABLE public.communication_logs ALTER COLUMN status SET DEFAULT 'programado'::communication_status;

UPDATE public.communication_logs
   SET status = 'programado'
 WHERE status = 'pendiente'
   AND sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_logs_programado_channel
  ON public.communication_logs (channel, created_at DESC)
  WHERE status = 'programado';