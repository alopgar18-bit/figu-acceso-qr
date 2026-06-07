CREATE TABLE public.ticket_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  design jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_global_default boolean NOT NULL DEFAULT false,
  scope_event_id uuid,
  scope_session_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_designs_single_scope CHECK (
    (CASE WHEN is_global_default THEN 1 ELSE 0 END)
    + (CASE WHEN scope_event_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN scope_session_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_designs TO authenticated;
GRANT ALL ON public.ticket_designs TO service_role;

ALTER TABLE public.ticket_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_designs_admin_all" ON public.ticket_designs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ticket_designs_staff_select" ON public.ticket_designs
  FOR SELECT TO authenticated
  USING (public.has_any_assignment(auth.uid()));

CREATE UNIQUE INDEX ticket_designs_unique_event ON public.ticket_designs (scope_event_id) WHERE scope_event_id IS NOT NULL;
CREATE UNIQUE INDEX ticket_designs_unique_session ON public.ticket_designs (scope_session_id) WHERE scope_session_id IS NOT NULL;
CREATE UNIQUE INDEX ticket_designs_unique_global_default ON public.ticket_designs ((is_global_default)) WHERE is_global_default = true;

CREATE TRIGGER set_ticket_designs_updated_at
  BEFORE UPDATE ON public.ticket_designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();