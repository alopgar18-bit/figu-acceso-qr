
CREATE TABLE IF NOT EXISTS public.whatsapp_drain_locks (
  lock_key text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  acquired_by text,
  expires_at timestamptz NOT NULL
);

GRANT ALL ON public.whatsapp_drain_locks TO service_role;

ALTER TABLE public.whatsapp_drain_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access whatsapp_drain_locks"
ON public.whatsapp_drain_locks FOR ALL TO service_role USING (true) WITH CHECK (true);
