
CREATE TABLE public.import_row_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('inserted','updated','skipped','errored')),
  participant_id uuid REFERENCES public.event_participants(id) ON DELETE SET NULL,
  match_reason text,
  error_message text,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_row_results_batch_idx ON public.import_row_results(batch_id);
CREATE INDEX import_row_results_outcome_idx ON public.import_row_results(batch_id, outcome);
CREATE INDEX import_row_results_participant_idx ON public.import_row_results(participant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_row_results TO authenticated;
GRANT ALL ON public.import_row_results TO service_role;

ALTER TABLE public.import_row_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read row results"
ON public.import_row_results FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_row_results.batch_id
      AND (
        b.event_id IS NULL
        OR public.has_event_assignment(auth.uid(), b.event_id, 'coordinador')
        OR public.has_event_assignment(auth.uid(), b.event_id, 'cliente_productora')
      )
  )
);

CREATE POLICY "Admins manage row results"
ON public.import_row_results FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
