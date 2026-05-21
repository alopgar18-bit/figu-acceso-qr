
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comm_logs_session_status
  ON public.communication_logs (session_id, status);

CREATE INDEX IF NOT EXISTS idx_comm_logs_batch
  ON public.communication_logs (batch_id);
