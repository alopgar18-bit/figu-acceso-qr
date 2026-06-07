INSERT INTO public.ticket_designs (name, design, scope_event_id, is_global_default)
SELECT
  'Diseño de ' || e.name,
  e.ticket_design,
  e.id,
  false
FROM public.events e
WHERE e.ticket_design IS NOT NULL
  AND e.ticket_design::text NOT IN ('{}', 'null')
  AND NOT EXISTS (
    SELECT 1 FROM public.ticket_designs td WHERE td.scope_event_id = e.id
  );