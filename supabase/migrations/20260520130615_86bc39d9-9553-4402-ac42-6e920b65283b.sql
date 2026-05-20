
-- Revocar acceso público a helpers SECURITY DEFINER
revoke execute on function public.has_event_assignment(uuid, uuid, public.assignment_role) from anon, authenticated, public;
revoke execute on function public.has_session_assignment(uuid, uuid, public.assignment_role) from anon, authenticated, public;
revoke execute on function public.client_user_has_event(uuid, uuid) from anon, authenticated, public;

-- Endurecer inserts públicos
drop policy if exists people_public_insert on public.people;
create policy people_insert_via_form on public.people
  for insert to anon, authenticated
  with check (
    -- Sólo se permite crear personas en el contexto de un formulario público activo
    exists (
      select 1 from public.public_forms f
      where f.status = 'publicado'
        and (f.opens_at is null or f.opens_at <= now())
        and (f.closes_at is null or f.closes_at >= now())
    )
    or public.is_admin(auth.uid())
  );

drop policy if exists consents_public_insert on public.consent_records;
create policy consents_insert_scoped on public.consent_records
  for insert to anon, authenticated
  with check (
    -- Debe referirse a un texto legal activo
    exists (
      select 1 from public.legal_texts lt
      where lt.id = consent_records.legal_text_id and lt.is_active = true
    )
  );
