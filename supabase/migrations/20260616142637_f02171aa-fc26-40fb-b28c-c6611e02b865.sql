
-- Wati integration: new columns on communication_logs + event_sessions
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS wati_local_message_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_estado text,
  ADD COLUMN IF NOT EXISTS whatsapp_failed_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_failed_detail text,
  ADD COLUMN IF NOT EXISTS whatsapp_last_event_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_comm_logs_wati_local_msg_id
  ON public.communication_logs(wati_local_message_id)
  WHERE wati_local_message_id IS NOT NULL;

ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS access_time text,
  ADD COLUMN IF NOT EXISTS end_time_estimate text,
  ADD COLUMN IF NOT EXISTS venue_address text;
