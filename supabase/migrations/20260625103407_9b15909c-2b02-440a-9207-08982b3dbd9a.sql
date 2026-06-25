ALTER TABLE public.import_row_results DROP CONSTRAINT IF EXISTS import_row_results_outcome_check;
ALTER TABLE public.import_row_results ADD CONSTRAINT import_row_results_outcome_check CHECK (outcome = ANY (ARRAY[
  'inserted'::text,
  'updated'::text,
  'skipped'::text,
  'errored'::text,
  'inserted_in_session'::text,
  'updated_in_session'::text,
  'updated_in_other_session'::text,
  'person_exists_no_participation'::text,
  'not_found'::text
]));