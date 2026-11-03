CREATE TABLE public.import_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  chunk_index int NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 4,
  next_attempt_at timestamptz,
  lock_owner text,
  lock_expires_at timestamptz,
  error text,
  result jsonb,
  created_by uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, chunk_index)
);
CREATE INDEX import_chunks_pending_idx ON public.import_chunks (created_at, chunk_index) WHERE status IN ('queued','running');

GRANT SELECT ON public.import_chunks TO authenticated;
GRANT ALL ON public.import_chunks TO service_role;
ALTER TABLE public.import_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins y coordinadores ven tramos de importación"
  ON public.import_chunks FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));

CREATE TRIGGER trg_import_chunks_updated_at BEFORE UPDATE ON public.import_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reserva el siguiente tramo pendiente. Serializa por lote (un solo tramo
-- en curso por lote) bloqueando la fila del lote durante la reserva.
CREATE OR REPLACE FUNCTION public.claim_import_chunk(_batch_id uuid, _owner text, _lock_seconds int DEFAULT 180)
RETURNS SETOF public.import_chunks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _b uuid;
  _id uuid;
BEGIN
  FOR _b IN
    SELECT c.batch_id FROM public.import_chunks c
     WHERE (_batch_id IS NULL OR c.batch_id = _batch_id)
       AND ((c.status = 'queued' AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now()))
            OR (c.status = 'running' AND c.lock_expires_at < now()))
     GROUP BY c.batch_id
     ORDER BY min(c.created_at)
  LOOP
    PERFORM 1 FROM public.import_batches WHERE id = _b FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.import_chunks
                WHERE batch_id = _b AND status = 'running' AND lock_expires_at >= now()) THEN
      CONTINUE;
    END IF;
    SELECT id INTO _id FROM public.import_chunks
     WHERE batch_id = _b
       AND ((status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
            OR (status = 'running' AND lock_expires_at < now()))
     ORDER BY chunk_index
     LIMIT 1;
    IF _id IS NOT NULL THEN
      RETURN QUERY
        UPDATE public.import_chunks
           SET status = 'running', lock_owner = _owner,
               lock_expires_at = now() + make_interval(secs => _lock_seconds),
               attempts = attempts + 1, started_at = COALESCE(started_at, now())
         WHERE id = _id
        RETURNING *;
      RETURN;
    END IF;
  END LOOP;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_import_chunk(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_import_chunk(uuid, text, int) TO service_role;