CREATE OR REPLACE FUNCTION public.can_view_session_seating(_user_id uuid, _session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
    OR public.has_session_assignment(_user_id, _session_id, 'coordinador')
    OR public.has_session_assignment(_user_id, _session_id, 'validador')
    OR EXISTS (SELECT 1 FROM public.event_sessions s WHERE s.id = _session_id AND (
         public.has_event_assignment(_user_id, s.event_id, 'coordinador')
      OR public.has_event_assignment(_user_id, s.event_id, 'validador')))
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_session_seating(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_session_seating(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read seat overrides" ON public.session_seat_overrides;
CREATE POLICY "Staff can read seat overrides" ON public.session_seat_overrides FOR SELECT TO authenticated
  USING (public.can_view_session_seating(auth.uid(), session_id));

DROP POLICY IF EXISTS assignment_proposals_select_authenticated ON public.assignment_proposals;
CREATE POLICY assignment_proposals_select_staff ON public.assignment_proposals FOR SELECT TO authenticated
  USING (public.can_view_session_seating(auth.uid(), session_id));

DROP POLICY IF EXISTS assignment_proposal_items_select_authenticated ON public.assignment_proposal_items;
CREATE POLICY assignment_proposal_items_select_staff ON public.assignment_proposal_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignment_proposals ap WHERE ap.id = proposal_id
    AND public.can_view_session_seating(auth.uid(), ap.session_id)));

DROP POLICY IF EXISTS assignment_rules_select_authenticated ON public.assignment_rules;
CREATE POLICY assignment_rules_select_staff ON public.assignment_rules FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'coordinador'));