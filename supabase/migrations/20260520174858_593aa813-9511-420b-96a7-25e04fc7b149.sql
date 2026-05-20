-- 1. Role / assignment helpers
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_assignment(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_assignments WHERE user_id = _user_id
  )
$$;

-- 2. Audit log helper
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _event_id uuid DEFAULT NULL,
  _session_id uuid DEFAULT NULL,
  _changes jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, event_id, session_id, actor_id, changes)
  VALUES (_action, _entity_type, _entity_id, _event_id, _session_id, auth.uid(), COALESCE(_changes, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- 3. Tighten import policies: NULL event_id => admin only
DROP POLICY IF EXISTS imports_coord_all ON public.import_batches;
CREATE POLICY imports_coord_all ON public.import_batches
  FOR ALL TO authenticated
  USING (event_id IS NOT NULL AND has_event_assignment(auth.uid(), event_id, 'coordinador'::assignment_role))
  WITH CHECK (event_id IS NOT NULL AND has_event_assignment(auth.uid(), event_id, 'coordinador'::assignment_role));

DROP POLICY IF EXISTS mappings_coord_all ON public.import_mappings;
CREATE POLICY mappings_coord_all ON public.import_mappings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_mappings.batch_id
      AND b.event_id IS NOT NULL
      AND has_event_assignment(auth.uid(), b.event_id, 'coordinador'::assignment_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_mappings.batch_id
      AND b.event_id IS NOT NULL
      AND has_event_assignment(auth.uid(), b.event_id, 'coordinador'::assignment_role)
  ));

-- 4. Templates: only admins or staff with at least one assignment
DROP POLICY IF EXISTS templates_coord_select ON public.communication_templates;
CREATE POLICY templates_staff_select ON public.communication_templates
  FOR SELECT TO authenticated
  USING (is_active = true AND has_any_assignment(auth.uid()));

-- 5. Public form / consent inserts use the service role server-side; remove anon write surface
DROP POLICY IF EXISTS people_insert_via_form ON public.people;
DROP POLICY IF EXISTS consents_insert_scoped ON public.consent_records;
DROP POLICY IF EXISTS submissions_public_insert ON public.form_submissions;

-- 6. Storage: tighten submission-photos bucket
DROP POLICY IF EXISTS submission_photos_anon_insert ON storage.objects;
CREATE POLICY submission_photos_anon_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'submission-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND octet_length(name) < 300
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND e.status = 'publicado'
        AND e.public_registration_enabled = true
    )
  );

CREATE POLICY submission_photos_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'submission-photos' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'submission-photos' AND public.is_admin(auth.uid()));

CREATE POLICY submission_photos_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'submission-photos' AND public.is_admin(auth.uid()));

-- 7. RGPD: anonymisation function (admin only)
CREATE OR REPLACE FUNCTION public.anonymize_person(_person_id uuid, _reason text DEFAULT 'rgpd_solicitud')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.people
  SET
    first_name = 'Anonimizado',
    last_name = NULL,
    dni = NULL,
    email = NULL,
    phone = NULL,
    birth_date = NULL,
    city = NULL,
    province = NULL,
    gender = NULL,
    notes = NULL,
    is_blocked = true,
    blocked_reason = _reason,
    updated_at = now()
  WHERE id = _person_id;

  UPDATE public.companions
  SET first_name = 'Anonimizado', last_name = NULL, dni = NULL
  WHERE participant_id IN (SELECT id FROM public.event_participants WHERE person_id = _person_id);

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, changes)
  VALUES ('person.anonymize', 'person', _person_id, auth.uid(), jsonb_build_object('reason', _reason));
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_person(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_person(uuid, text) TO authenticated;