
-- 1. Archive columns on communication_logs
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS communication_logs_archived_idx
  ON public.communication_logs (archived_at);

-- 2. Track origin batch on participants (for cascade delete)
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS event_participants_import_batch_idx
  ON public.event_participants (import_batch_id);

-- 3. Admin gate helper (reuse is_admin)
-- already exists: public.is_admin(uuid)

-- 4. Delete participants + cascade
CREATE OR REPLACE FUNCTION public.admin_delete_participants(_participant_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int;
  _ticket_count int;
  _checkin_count int;
  _comm_count int;
  _comp_count int;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _participant_ids IS NULL OR array_length(_participant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  -- Cascading deletes (no FKs in the schema, do it manually)
  WITH d AS (DELETE FROM public.checkins WHERE participant_id = ANY(_participant_ids) RETURNING 1)
    SELECT count(*) INTO _checkin_count FROM d;
  WITH d AS (DELETE FROM public.tickets WHERE participant_id = ANY(_participant_ids) RETURNING 1)
    SELECT count(*) INTO _ticket_count FROM d;
  WITH d AS (DELETE FROM public.companions WHERE participant_id = ANY(_participant_ids) RETURNING 1)
    SELECT count(*) INTO _comp_count FROM d;
  DELETE FROM public.consent_records WHERE participant_id = ANY(_participant_ids);
  WITH d AS (DELETE FROM public.communication_logs WHERE participant_id = ANY(_participant_ids) RETURNING 1)
    SELECT count(*) INTO _comm_count FROM d;

  WITH d AS (DELETE FROM public.event_participants WHERE id = ANY(_participant_ids) RETURNING 1)
    SELECT count(*) INTO _count FROM d;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, actor_id, changes)
  VALUES (
    'participants.delete', 'event_participants', NULL, _actor,
    jsonb_build_object(
      'participant_ids', _participant_ids,
      'deleted', _count,
      'tickets_deleted', _ticket_count,
      'checkins_deleted', _checkin_count,
      'companions_deleted', _comp_count,
      'comm_logs_deleted', _comm_count
    )
  );

  RETURN jsonb_build_object(
    'deleted', _count,
    'tickets_deleted', _ticket_count,
    'checkins_deleted', _checkin_count,
    'companions_deleted', _comp_count,
    'comm_logs_deleted', _comm_count
  );
END;
$$;

-- 5. Delete import batch (and optionally its participants)
CREATE OR REPLACE FUNCTION public.admin_delete_import_batch(
  _batch_id uuid,
  _delete_participants boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _ids uuid[];
  _participants_result jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _delete_participants THEN
    SELECT array_agg(id) INTO _ids
    FROM public.event_participants
    WHERE import_batch_id = _batch_id;
    IF _ids IS NOT NULL THEN
      _participants_result := public.admin_delete_participants(_ids);
    END IF;
  END IF;

  DELETE FROM public.import_mappings WHERE batch_id = _batch_id;
  DELETE FROM public.import_batches WHERE id = _batch_id;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, actor_id, changes)
  VALUES (
    'import_batch.delete', 'import_batch', _batch_id, _actor,
    jsonb_build_object(
      'delete_participants', _delete_participants,
      'participants_result', _participants_result
    )
  );

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'delete_participants', _delete_participants,
    'participants_result', _participants_result
  );
END;
$$;

-- 6. Delete tickets (revoke + remove)
CREATE OR REPLACE FUNCTION public.admin_delete_tickets(_ticket_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _ticket_ids IS NULL OR array_length(_ticket_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  UPDATE public.checkins SET ticket_id = NULL WHERE ticket_id = ANY(_ticket_ids);
  WITH d AS (DELETE FROM public.tickets WHERE id = ANY(_ticket_ids) RETURNING 1)
    SELECT count(*) INTO _count FROM d;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, actor_id, changes)
  VALUES (
    'tickets.delete', 'tickets', NULL, _actor,
    jsonb_build_object('ticket_ids', _ticket_ids, 'deleted', _count)
  );

  RETURN jsonb_build_object('deleted', _count);
END;
$$;

-- 7. Archive communication logs (hide from queue, keep audit)
CREATE OR REPLACE FUNCTION public.admin_archive_communication_logs(_log_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _log_ids IS NULL OR array_length(_log_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('archived', 0);
  END IF;

  WITH u AS (
    UPDATE public.communication_logs
       SET archived_at = now(), archived_by = _actor
     WHERE id = ANY(_log_ids) AND archived_at IS NULL
     RETURNING 1
  )
  SELECT count(*) INTO _count FROM u;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, actor_id, changes)
  VALUES (
    'communication_logs.archive', 'communication_logs', NULL, _actor,
    jsonb_build_object('log_ids', _log_ids, 'archived', _count)
  );

  RETURN jsonb_build_object('archived', _count);
END;
$$;

-- 8. Delete communication logs (hard delete)
CREATE OR REPLACE FUNCTION public.admin_delete_communication_logs(_log_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _log_ids IS NULL OR array_length(_log_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  WITH d AS (DELETE FROM public.communication_logs WHERE id = ANY(_log_ids) RETURNING 1)
    SELECT count(*) INTO _count FROM d;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, actor_id, changes)
  VALUES (
    'communication_logs.delete', 'communication_logs', NULL, _actor,
    jsonb_build_object('log_ids', _log_ids, 'deleted', _count)
  );

  RETURN jsonb_build_object('deleted', _count);
END;
$$;
