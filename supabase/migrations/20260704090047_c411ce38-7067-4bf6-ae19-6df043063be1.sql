
-- Partial index to speed up capacity count queries on hot sessions
CREATE INDEX IF NOT EXISTS idx_participants_session_active
  ON public.event_participants (session_id)
  WHERE status IN (
    'solicitud_recibida','pendiente_revision','aprobado',
    'invitacion_enviada','pendiente_confirmacion','confirmado',
    'qr_generado','acceso_validado'
  );

-- Atomic public form submission: single round-trip, per-session row lock
CREATE OR REPLACE FUNCTION public.submit_public_form(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _form_slug        text := _payload->>'formSlug';
  _event_slug       text := _payload->>'eventSlug';
  _session_id       uuid := NULLIF(_payload->>'sessionId','')::uuid;
  _first_name       text := _payload->>'firstName';
  _last_name        text := _payload->>'lastName';
  _dni              text := NULLIF(_payload->>'dni','');
  _email            text := lower(_payload->>'email');
  _phone            text := NULLIF(_payload->>'phone','');
  _birth_date       date := NULLIF(_payload->>'birthDate','')::date;
  _photo_path       text := NULLIF(_payload->>'photoPath','');
  _social_media     text := NULLIF(_payload->>'socialMedia','');
  _city             text := NULLIF(_payload->>'city','');
  _province         text := NULLIF(_payload->>'province','');
  _gender           text := NULLIF(_payload->>'gender','');
  _profession       text := NULLIF(_payload->>'profession','');
  _notes            text := NULLIF(_payload->>'notes','');
  _special_needs    text := NULLIF(_payload->>'specialNeeds','');
  _companions_count int  := COALESCE((_payload->>'companionsCount')::int, 0);
  _companions       jsonb := COALESCE(_payload->'companions','[]'::jsonb);
  _accept_privacy   boolean := COALESCE((_payload->>'acceptPrivacy')::boolean, false);
  _accept_image     boolean := COALESCE((_payload->>'acceptImage')::boolean, false);
  _accept_future    boolean := (_payload->>'acceptFuture')::boolean;
  _has_future       boolean := (_payload ? 'acceptFuture');
  _user_agent       text := NULLIF(_payload->>'userAgent','');

  _form            record;
  _event           record;
  _session         record;
  _field_cfg       jsonb;
  _image_visible   boolean;
  _image_required  boolean;
  _allow_comp      boolean;
  _max_comp        int;
  _occupied        int;
  _full            boolean;
  _waitlist        boolean;
  _person_id       uuid;
  _submission_id   uuid;
  _participant_id  uuid;
  _participant_status participant_status;
  _min_age         int;
  _age             int;
  _privacy_ids     uuid[];
  _privacy_id      uuid;
  _image_legal_id  uuid;
  _future_legal_id uuid;
  _comp            jsonb;
BEGIN
  IF NOT _accept_privacy THEN
    RETURN jsonb_build_object('ok', false, 'code', 'consentimiento_privacidad_requerido');
  END IF;

  -- Resolve form
  IF _form_slug IS NOT NULL THEN
    SELECT id, event_id, session_id, status, field_config, opens_at, closes_at
      INTO _form FROM public.public_forms WHERE slug = _form_slug;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'evento_no_disponible'); END IF;
    IF _form.status <> 'publicado' THEN RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas'); END IF;
    IF _form.opens_at IS NOT NULL AND _form.opens_at > now() THEN RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas'); END IF;
    IF _form.closes_at IS NOT NULL AND _form.closes_at < now() THEN RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas'); END IF;

    SELECT * INTO _event FROM public.events WHERE id = _form.event_id;
    IF NOT FOUND OR _event.status <> 'publicado' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'evento_no_disponible');
    END IF;
    _session_id := COALESCE(_form.session_id, _session_id);
  ELSE
    SELECT * INTO _event FROM public.events WHERE slug = _event_slug AND status = 'publicado';
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'evento_no_disponible'); END IF;
    IF NOT COALESCE(_event.public_registration_enabled, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas');
    END IF;
    _form := NULL;
  END IF;

  -- Resolve session
  IF _session_id IS NULL THEN
    IF _event.user_can_choose_session THEN
      RETURN jsonb_build_object('ok', false, 'code', 'sesion_requerida');
    END IF;
    SELECT id INTO _session_id FROM public.event_sessions
      WHERE event_id = _event.id ORDER BY starts_at ASC LIMIT 1;
    IF _session_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas'); END IF;
  END IF;

  -- LOCK session row: serializes concurrent submits per session, prevents overbooking
  SELECT * INTO _session FROM public.event_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'sesion_no_disponible'); END IF;
  IF _session.event_id <> _event.id THEN RETURN jsonb_build_object('ok', false, 'code', 'sesion_no_disponible'); END IF;
  IF _session.status IN ('cerrada','cancelada','completada') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inscripciones_cerradas');
  END IF;

  -- Age check
  _min_age := COALESCE(_session.min_age, _event.default_min_age, 0);
  IF _birth_date IS NOT NULL AND _min_age > 0 THEN
    _age := extract(year from age(_birth_date))::int;
    IF _age < _min_age THEN
      RETURN jsonb_build_object('ok', false, 'code', 'edad_minima_no_cumplida', 'minAge', _min_age);
    END IF;
  END IF;

  -- Image consent required?
  _field_cfg := COALESCE(_form.field_config, '{}'::jsonb);
  _image_visible := COALESCE((_field_cfg->'consent_image'->>'visible')::boolean, true);
  _image_required := (COALESCE(_event.requires_image_consent, false) OR COALESCE(_event.requires_recording, false)) AND _image_visible;
  IF _image_required AND NOT _accept_image THEN
    RETURN jsonb_build_object('ok', false, 'code', 'consentimiento_imagen_requerido');
  END IF;

  -- Capacity (row lock above serializes this against concurrent inserts)
  SELECT count(*) INTO _occupied FROM public.event_participants
    WHERE session_id = _session_id
      AND status IN ('solicitud_recibida','pendiente_revision','aprobado','invitacion_enviada','pendiente_confirmacion','confirmado','qr_generado','acceso_validado');
  _full := _occupied >= _session.capacity;
  _waitlist := COALESCE(_session.waitlist_enabled, _event.default_waitlist_enabled, false);
  IF _full AND NOT _waitlist THEN
    RETURN jsonb_build_object('ok', false, 'code', 'sesion_completa');
  END IF;

  -- Companions clamp
  _allow_comp := COALESCE(_session.allow_companions, _event.default_allow_companions, false);
  _max_comp := CASE WHEN _allow_comp THEN COALESCE(_session.max_companions_per_participant, _event.default_max_companions, 0) ELSE 0 END;
  _companions_count := LEAST(GREATEST(_companions_count, 0), _max_comp);

  -- Person upsert (by DNI first, else by email)
  IF _dni IS NOT NULL THEN
    SELECT id INTO _person_id FROM public.people WHERE lower(dni) = lower(_dni) LIMIT 1;
  END IF;
  IF _person_id IS NULL AND _email IS NOT NULL THEN
    SELECT id INTO _person_id FROM public.people WHERE lower(email) = _email LIMIT 1;
  END IF;
  IF _person_id IS NOT NULL THEN
    UPDATE public.people SET
      first_name = _first_name, last_name = _last_name,
      dni = COALESCE(_dni, dni), email = COALESCE(_email, email),
      phone = COALESCE(_phone, phone), birth_date = COALESCE(_birth_date, birth_date),
      city = COALESCE(_city, city), province = COALESCE(_province, province),
      gender = COALESCE(_gender, gender), updated_at = now()
    WHERE id = _person_id;
  ELSE
    INSERT INTO public.people(first_name, last_name, dni, email, phone, birth_date, city, province, gender, source)
    VALUES (_first_name, _last_name, _dni, _email, _phone, _birth_date, _city, _province, _gender, 'formulario_publico')
    RETURNING id INTO _person_id;
  END IF;

  -- Duplicate check (unique index enforces this anyway)
  IF EXISTS (SELECT 1 FROM public.event_participants WHERE session_id = _session_id AND person_id = _person_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicado');
  END IF;

  -- Ensure a form exists for legacy event-slug path
  IF _form IS NULL THEN
    SELECT id, event_id, session_id, status, field_config, opens_at, closes_at
      INTO _form FROM public.public_forms
      WHERE event_id = _event.id ORDER BY created_at ASC LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.public_forms(event_id, session_id, slug, title, status, fields_schema)
      VALUES (_event.id, _session_id, 'auto-' || substr(_event.id::text, 1, 8), 'Formulario público', 'publicado', '[]'::jsonb)
      RETURNING id, event_id, session_id, status, field_config, opens_at, closes_at INTO _form;
    END IF;
  END IF;

  -- Submission
  INSERT INTO public.form_submissions(form_id, event_id, session_id, person_id, payload, user_agent)
  VALUES (_form.id, _event.id, _session_id, _person_id,
    jsonb_build_object(
      'profession', _profession, 'social_media', _social_media,
      'special_needs', _special_needs, 'notes', _notes,
      'companions_count', _companions_count, 'photo_path', _photo_path
    ), _user_agent)
  RETURNING id INTO _submission_id;

  -- Participant
  _participant_status := CASE WHEN _full AND _waitlist THEN 'lista_espera'::participant_status ELSE 'pendiente_revision'::participant_status END;
  INSERT INTO public.event_participants(event_id, session_id, person_id, submission_id, status, attendee_type, companions_count, internal_notes, public_form_id)
  VALUES (_event.id, _session_id, _person_id, _submission_id, _participant_status, 'publico', _companions_count, _special_needs, _form.id)
  RETURNING id INTO _participant_id;

  -- Companions
  IF _companions_count > 0 THEN
    INSERT INTO public.companions(participant_id, first_name, last_name, email, phone)
    SELECT _participant_id,
      NULLIF(c->>'firstName',''), NULLIF(c->>'lastName',''),
      NULLIF(lower(c->>'email'),''), NULLIF(c->>'phone','')
    FROM jsonb_array_elements(_companions) WITH ORDINALITY AS t(c, ord)
    WHERE ord <= _companions_count;
  END IF;

  -- Consents (privacy: one per active legal text, or ensure default)
  SELECT array_agg(id) INTO _privacy_ids FROM public.legal_texts
    WHERE kind = 'privacidad' AND is_active = true;
  IF _privacy_ids IS NULL OR array_length(_privacy_ids, 1) IS NULL THEN
    INSERT INTO public.legal_texts(kind, title, version, body, is_active)
    VALUES ('privacidad', 'Política de privacidad', '1.0', 'Política de privacidad — versión inicial pendiente de redacción por FIGURARTE.', true)
    RETURNING id INTO _privacy_id;
    _privacy_ids := ARRAY[_privacy_id];
  END IF;
  INSERT INTO public.consent_records(consent_kind, person_id, submission_id, participant_id, legal_text_id, accepted, user_agent)
  SELECT 'privacidad', _person_id, _submission_id, _participant_id, unnest(_privacy_ids), _accept_privacy, _user_agent;

  IF _image_required THEN
    SELECT id INTO _image_legal_id FROM public.legal_texts
      WHERE kind = 'imagen' AND is_active = true
      ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    IF _image_legal_id IS NULL THEN
      INSERT INTO public.legal_texts(kind, title, version, body, is_active)
      VALUES ('imagen', 'Consentimiento de cesión de imagen', '1.0', 'Consentimiento de cesión de imagen — versión inicial pendiente de redacción por FIGURARTE.', true)
      RETURNING id INTO _image_legal_id;
    END IF;
    INSERT INTO public.consent_records(consent_kind, person_id, submission_id, participant_id, legal_text_id, accepted, user_agent)
    VALUES ('imagen', _person_id, _submission_id, _participant_id, _image_legal_id, _accept_image, _user_agent);
  END IF;

  IF _has_future THEN
    SELECT id INTO _future_legal_id FROM public.legal_texts
      WHERE kind = 'futuros_procesos' AND is_active = true
      ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    IF _future_legal_id IS NULL THEN
      INSERT INTO public.legal_texts(kind, title, version, body, is_active)
      VALUES ('futuros_procesos', 'Consentimiento para futuros procesos', '1.0', 'Consentimiento para futuros procesos — versión inicial pendiente de redacción por FIGURARTE.', true)
      RETURNING id INTO _future_legal_id;
    END IF;
    INSERT INTO public.consent_records(consent_kind, person_id, submission_id, participant_id, legal_text_id, accepted, user_agent)
    VALUES ('futuros_procesos', _person_id, _submission_id, _participant_id, _future_legal_id, COALESCE(_accept_future, false), _user_agent);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', CASE WHEN _participant_status = 'lista_espera' THEN 'lista_espera' ELSE 'recibida' END,
    'participantId', _participant_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race: same person raced two submits for same session
    RETURN jsonb_build_object('ok', false, 'code', 'duplicado');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_form(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_public_form(jsonb) TO service_role;
