
-- =========================================================================
-- FIGURARTE Access — Core data model
-- =========================================================================

-- ENUMS -------------------------------------------------------------------
create type public.event_type as enum (
  'publico_tv','grabacion','casting','premiere','produccion','otro'
);

create type public.event_status as enum (
  'borrador','publicado','cerrado','cancelado','archivado'
);

create type public.session_status as enum (
  'programada','abierta','cerrada','cancelada','completada'
);

create type public.participant_status as enum (
  'solicitud_recibida','pendiente_revision','aprobado','rechazado',
  'lista_espera','invitacion_enviada','pendiente_confirmacion','confirmado',
  'cancelado_asistente','cancelado_figurarte','qr_generado','acceso_validado',
  'no_presentado','incidencia','bloqueado'
);

create type public.attendee_type as enum (
  'publico','figurante','casting','vip','prensa','equipo','acompanante','otro'
);

create type public.assignment_role as enum (
  'coordinador','validador','cliente_productora'
);

create type public.legal_text_kind as enum (
  'privacidad','imagen','futuros_procesos','terminos','otro'
);

create type public.consent_kind as enum (
  'privacidad','imagen','futuros_procesos'
);

create type public.communication_channel as enum (
  'email','whatsapp_asistido','sms','manual'
);

create type public.communication_status as enum (
  'pendiente','enviado','fallido','programado','cancelado'
);

create type public.checkin_result as enum (
  'ok','duplicado','no_valido','cancelado','fuera_de_horario','incidencia'
);

create type public.incident_severity as enum ('baja','media','alta','critica');
create type public.incident_status as enum ('abierta','en_proceso','resuelta','descartada');

create type public.import_status as enum (
  'pendiente','procesando','completada','completada_con_errores','fallida'
);

create type public.form_status as enum ('borrador','publicado','cerrado','archivado');

-- =========================================================================
-- Helper: updated_at trigger ya existe (public.set_updated_at)
-- =========================================================================

-- =========================================================================
-- CLIENTS / PRODUCTORAS
-- =========================================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  contact_email text,
  contact_phone text,
  notes text,
  is_active boolean not null default true,
  -- Permisos configurables de visibilidad de datos
  visibility_permissions jsonb not null default jsonb_build_object(
    'see_email', false,
    'see_phone', false,
    'see_dni', false,
    'see_companions', true,
    'see_checkin_status', true,
    'see_personal_notes', false,
    'export_data', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Vincular usuarios cliente_productora a un cliente
create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(client_id, user_id)
);
create index idx_client_users_user on public.client_users(user_id);

-- =========================================================================
-- EVENTS & SESSIONS
-- =========================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  slug text unique,
  description text,
  event_type public.event_type not null default 'publico_tv',
  status public.event_status not null default 'borrador',
  location_name text,
  location_address text,
  -- Si el evento implica grabación → consentimiento de imagen obligatorio
  requires_recording boolean not null default false,
  requires_image_consent boolean not null default false,
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_events_client on public.events(client_id);
create index idx_events_status on public.events(status);
create trigger trg_events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  doors_open_at timestamptz,
  -- Aforo propio por sesión
  capacity integer not null default 0 check (capacity >= 0),
  waitlist_enabled boolean not null default true,
  -- Acompañantes configurables por sesión, siempre cuentan para aforo
  allow_companions boolean not null default false,
  max_companions_per_participant integer not null default 0 check (max_companions_per_participant >= 0),
  status public.session_status not null default 'programada',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sessions_event on public.event_sessions(event_id);
create index idx_sessions_starts_at on public.event_sessions(starts_at);
create trigger trg_sessions_updated_at before update on public.event_sessions
  for each row execute function public.set_updated_at();

-- Asignaciones de personal y clientes a eventos/sesiones
create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete cascade,
  user_id uuid,           -- coordinador/validador
  client_id uuid references public.clients(id) on delete cascade, -- para cliente_productora
  role public.assignment_role not null,
  created_at timestamptz not null default now(),
  check (user_id is not null or client_id is not null)
);
create index idx_assignments_event on public.event_assignments(event_id);
create index idx_assignments_session on public.event_assignments(session_id);
create index idx_assignments_user on public.event_assignments(user_id);
create index idx_assignments_client on public.event_assignments(client_id);

-- =========================================================================
-- PEOPLE (base global) y PARTICIPANTS
-- =========================================================================
create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  dni text,
  email text,
  phone text,
  birth_date date,
  gender text,
  city text,
  province text,
  country text default 'ES',
  notes text,
  is_blocked boolean not null default false,
  blocked_reason text,
  source text, -- form, import, manual
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_people_dni on public.people(lower(dni)) where dni is not null;
create index idx_people_email on public.people(lower(email));
create index idx_people_phone on public.people(phone);
create trigger trg_people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  attendee_type public.attendee_type not null default 'publico',
  status public.participant_status not null default 'solicitud_recibida',
  companions_count integer not null default 0 check (companions_count >= 0),
  submission_id uuid, -- FK añadida después
  approved_at timestamptz,
  approved_by uuid,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, person_id)
);
create index idx_participants_event on public.event_participants(event_id);
create index idx_participants_session on public.event_participants(session_id);
create index idx_participants_person on public.event_participants(person_id);
create index idx_participants_status on public.event_participants(status);
create trigger trg_participants_updated_at before update on public.event_participants
  for each row execute function public.set_updated_at();

create table public.companions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  first_name text,
  last_name text,
  dni text,
  age integer,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_companions_participant on public.companions(participant_id);

-- =========================================================================
-- PUBLIC FORMS & SUBMISSIONS
-- =========================================================================
create table public.public_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  status public.form_status not null default 'borrador',
  -- Definición de campos en JSON
  fields_schema jsonb not null default '[]'::jsonb,
  requires_privacy_consent boolean not null default true,
  requires_image_consent boolean not null default false,
  offers_future_processes_consent boolean not null default true,
  max_submissions integer,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_forms_event on public.public_forms(event_id);
create trigger trg_forms_updated_at before update on public.public_forms
  for each row execute function public.set_updated_at();

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.public_forms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.event_sessions(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  submitted_at timestamptz not null default now(),
  processed boolean not null default false,
  processed_at timestamptz
);
create index idx_submissions_form on public.form_submissions(form_id);
create index idx_submissions_event on public.form_submissions(event_id);
create index idx_submissions_person on public.form_submissions(person_id);

alter table public.event_participants
  add constraint event_participants_submission_fk
  foreign key (submission_id) references public.form_submissions(id) on delete set null;

-- =========================================================================
-- LEGAL & CONSENTS
-- =========================================================================
create table public.legal_texts (
  id uuid primary key default gen_random_uuid(),
  kind public.legal_text_kind not null,
  version text not null,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(kind, version)
);
create index idx_legal_active on public.legal_texts(kind, is_active);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  submission_id uuid references public.form_submissions(id) on delete set null,
  participant_id uuid references public.event_participants(id) on delete set null,
  legal_text_id uuid not null references public.legal_texts(id) on delete restrict,
  consent_kind public.consent_kind not null,
  accepted boolean not null,
  ip_address inet,
  user_agent text,
  accepted_at timestamptz not null default now()
);
create index idx_consents_person on public.consent_records(person_id);
create index idx_consents_participant on public.consent_records(participant_id);

-- =========================================================================
-- IMPORTS
-- =========================================================================
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  session_id uuid references public.event_sessions(id) on delete set null,
  filename text not null,
  source text, -- google_forms, csv, excel
  status public.import_status not null default 'pendiente',
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  error_rows integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_imports_event on public.import_batches(event_id);

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_column text not null,
  target_field text not null,
  transform text, -- expresión opcional
  created_at timestamptz not null default now()
);
create index idx_mappings_batch on public.import_mappings(batch_id);

-- =========================================================================
-- COMMUNICATIONS
-- =========================================================================
create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel public.communication_channel not null,
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_templates_updated_at before update on public.communication_templates
  for each row execute function public.set_updated_at();

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.communication_templates(id) on delete set null,
  participant_id uuid references public.event_participants(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  session_id uuid references public.event_sessions(id) on delete set null,
  channel public.communication_channel not null,
  status public.communication_status not null default 'pendiente',
  to_address text,
  subject text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_comm_logs_participant on public.communication_logs(participant_id);
create index idx_comm_logs_event on public.communication_logs(event_id);

-- =========================================================================
-- TICKETS (QR) — solo tras confirmación
-- =========================================================================
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.event_participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  qr_token text not null unique,
  qr_payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked boolean not null default false,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);
create index idx_tickets_event on public.tickets(event_id);
create index idx_tickets_session on public.tickets(session_id);

-- =========================================================================
-- CHECKINS
-- =========================================================================
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete set null,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  validator_id uuid, -- usuario validador
  result public.checkin_result not null default 'ok',
  companions_validated integer not null default 0,
  device_info text,
  notes text,
  checked_in_at timestamptz not null default now()
);
create index idx_checkins_session on public.checkins(session_id);
create index idx_checkins_participant on public.checkins(participant_id);

-- =========================================================================
-- INCIDENTS
-- =========================================================================
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  session_id uuid references public.event_sessions(id) on delete set null,
  participant_id uuid references public.event_participants(id) on delete set null,
  reported_by uuid,
  assigned_to uuid,
  severity public.incident_severity not null default 'media',
  status public.incident_status not null default 'abierta',
  title text not null,
  description text,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_incidents_event on public.incidents(event_id);
create index idx_incidents_status on public.incidents(status);
create trigger trg_incidents_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

-- =========================================================================
-- AUDIT LOGS
-- =========================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  event_id uuid,
  session_id uuid,
  changes jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_actor on public.audit_logs(actor_id);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_created on public.audit_logs(created_at desc);

-- =========================================================================
-- HELPER FUNCTIONS (security definer)
-- =========================================================================

-- ¿Usuario asignado al evento con un rol concreto?
create or replace function public.has_event_assignment(_user_id uuid, _event_id uuid, _role public.assignment_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_assignments
    where event_id = _event_id
      and role = _role
      and user_id = _user_id
  )
$$;

-- ¿Usuario asignado a la sesión (directa o vía evento)?
create or replace function public.has_session_assignment(_user_id uuid, _session_id uuid, _role public.assignment_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_assignments ea
    join public.event_sessions es on es.event_id = ea.event_id
    where es.id = _session_id
      and ea.role = _role
      and ea.user_id = _user_id
      and (ea.session_id is null or ea.session_id = _session_id)
  )
$$;

-- ¿El cliente del usuario tiene acceso al evento?
create or replace function public.client_user_has_event(_user_id uuid, _event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_users cu
    join public.event_assignments ea on ea.client_id = cu.client_id
    where cu.user_id = _user_id
      and ea.event_id = _event_id
      and ea.role = 'cliente_productora'
  )
$$;

-- =========================================================================
-- ENABLE RLS
-- =========================================================================
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_assignments enable row level security;
alter table public.people enable row level security;
alter table public.event_participants enable row level security;
alter table public.companions enable row level security;
alter table public.public_forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.legal_texts enable row level security;
alter table public.consent_records enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_mappings enable row level security;
alter table public.communication_templates enable row level security;
alter table public.communication_logs enable row level security;
alter table public.tickets enable row level security;
alter table public.checkins enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;

-- =========================================================================
-- POLICIES — Patrón: admin (full) + roles operativos (scoped)
-- =========================================================================

-- CLIENTS
create policy clients_admin_all on public.clients
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy clients_client_user_select on public.clients
  for select to authenticated
  using (exists (
    select 1 from public.client_users cu
    where cu.client_id = clients.id and cu.user_id = auth.uid()
  ));

-- CLIENT_USERS
create policy client_users_admin_all on public.client_users
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy client_users_select_own on public.client_users
  for select to authenticated
  using (user_id = auth.uid());

-- EVENTS
create policy events_admin_all on public.events
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy events_coord_select on public.events
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), id, 'coordinador'));
create policy events_validator_select on public.events
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), id, 'validador'));
create policy events_client_select on public.events
  for select to authenticated
  using (public.client_user_has_event(auth.uid(), id));
-- Eventos publicados son visibles para cualquier visitante (formularios públicos)
create policy events_public_published on public.events
  for select to anon, authenticated
  using (status = 'publicado');

-- EVENT_SESSIONS
create policy sessions_admin_all on public.event_sessions
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy sessions_coord_select on public.event_sessions
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy sessions_validator_select on public.event_sessions
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'validador'));
create policy sessions_client_select on public.event_sessions
  for select to authenticated
  using (public.client_user_has_event(auth.uid(), event_id));
create policy sessions_public_select on public.event_sessions
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_sessions.event_id and e.status = 'publicado'
  ));

-- EVENT_ASSIGNMENTS
create policy assignments_admin_all on public.event_assignments
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy assignments_self_select on public.event_assignments
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.client_users cu
                    where cu.client_id = event_assignments.client_id
                      and cu.user_id = auth.uid()));

-- PEOPLE — base global, sólo personal interno
create policy people_admin_all on public.people
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy people_coord_select on public.people
  for select to authenticated
  using (exists (
    select 1 from public.event_participants p
    where p.person_id = people.id
      and public.has_event_assignment(auth.uid(), p.event_id, 'coordinador')
  ));
create policy people_validator_select on public.people
  for select to authenticated
  using (exists (
    select 1 from public.event_participants p
    where p.person_id = people.id
      and public.has_event_assignment(auth.uid(), p.event_id, 'validador')
  ));
-- Insert público: formularios anónimos crean personas
create policy people_public_insert on public.people
  for insert to anon, authenticated
  with check (true);

-- EVENT_PARTICIPANTS
create policy participants_admin_all on public.event_participants
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy participants_coord_all on public.event_participants
  for all to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'))
  with check (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy participants_validator_select on public.event_participants
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'validador'));
create policy participants_client_select on public.event_participants
  for select to authenticated
  using (public.client_user_has_event(auth.uid(), event_id));

-- COMPANIONS
create policy companions_admin_all on public.companions
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy companions_scoped_select on public.companions
  for select to authenticated
  using (exists (
    select 1 from public.event_participants p
    where p.id = companions.participant_id
      and (public.has_event_assignment(auth.uid(), p.event_id, 'coordinador')
        or public.has_event_assignment(auth.uid(), p.event_id, 'validador')
        or public.client_user_has_event(auth.uid(), p.event_id))
  ));
create policy companions_coord_write on public.companions
  for all to authenticated
  using (exists (
    select 1 from public.event_participants p
    where p.id = companions.participant_id
      and public.has_event_assignment(auth.uid(), p.event_id, 'coordinador')
  ))
  with check (exists (
    select 1 from public.event_participants p
    where p.id = companions.participant_id
      and public.has_event_assignment(auth.uid(), p.event_id, 'coordinador')
  ));

-- PUBLIC_FORMS
create policy forms_admin_all on public.public_forms
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy forms_coord_select on public.public_forms
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy forms_public_select on public.public_forms
  for select to anon, authenticated
  using (status = 'publicado'
         and (opens_at is null or opens_at <= now())
         and (closes_at is null or closes_at >= now()));

-- FORM_SUBMISSIONS
create policy submissions_admin_all on public.form_submissions
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy submissions_coord_select on public.form_submissions
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy submissions_public_insert on public.form_submissions
  for insert to anon, authenticated
  with check (exists (
    select 1 from public.public_forms f
    where f.id = form_submissions.form_id
      and f.status = 'publicado'
      and (f.opens_at is null or f.opens_at <= now())
      and (f.closes_at is null or f.closes_at >= now())
  ));

-- LEGAL_TEXTS
create policy legal_admin_all on public.legal_texts
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy legal_public_select_active on public.legal_texts
  for select to anon, authenticated
  using (is_active = true);

-- CONSENT_RECORDS
create policy consents_admin_all on public.consent_records
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy consents_public_insert on public.consent_records
  for insert to anon, authenticated
  with check (true);
create policy consents_coord_select on public.consent_records
  for select to authenticated
  using (exists (
    select 1 from public.event_participants p
    where p.id = consent_records.participant_id
      and public.has_event_assignment(auth.uid(), p.event_id, 'coordinador')
  ));

-- IMPORT_BATCHES / MAPPINGS — solo admin/coordinador
create policy imports_admin_all on public.import_batches
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy imports_coord_all on public.import_batches
  for all to authenticated
  using (event_id is null or public.has_event_assignment(auth.uid(), event_id, 'coordinador'))
  with check (event_id is null or public.has_event_assignment(auth.uid(), event_id, 'coordinador'));

create policy mappings_admin_all on public.import_mappings
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy mappings_coord_all on public.import_mappings
  for all to authenticated
  using (exists (
    select 1 from public.import_batches b
    where b.id = import_mappings.batch_id
      and (b.event_id is null or public.has_event_assignment(auth.uid(), b.event_id, 'coordinador'))
  ))
  with check (exists (
    select 1 from public.import_batches b
    where b.id = import_mappings.batch_id
      and (b.event_id is null or public.has_event_assignment(auth.uid(), b.event_id, 'coordinador'))
  ));

-- COMMUNICATION_TEMPLATES
create policy templates_admin_all on public.communication_templates
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy templates_coord_select on public.communication_templates
  for select to authenticated
  using (is_active = true);

-- COMMUNICATION_LOGS
create policy comm_logs_admin_all on public.communication_logs
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy comm_logs_coord_select on public.communication_logs
  for select to authenticated
  using (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy comm_logs_coord_insert on public.communication_logs
  for insert to authenticated
  with check (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'coordinador'));

-- TICKETS
create policy tickets_admin_all on public.tickets
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy tickets_coord_select on public.tickets
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy tickets_validator_select on public.tickets
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'validador'));

-- CHECKINS
create policy checkins_admin_all on public.checkins
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy checkins_validator_all on public.checkins
  for all to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'validador'))
  with check (public.has_event_assignment(auth.uid(), event_id, 'validador'));
create policy checkins_coord_select on public.checkins
  for select to authenticated
  using (public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy checkins_client_select on public.checkins
  for select to authenticated
  using (public.client_user_has_event(auth.uid(), event_id));

-- INCIDENTS
create policy incidents_admin_all on public.incidents
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
create policy incidents_coord_all on public.incidents
  for all to authenticated
  using (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'coordinador'))
  with check (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'coordinador'));
create policy incidents_validator_insert on public.incidents
  for insert to authenticated
  with check (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'validador'));
create policy incidents_validator_select on public.incidents
  for select to authenticated
  using (event_id is not null and public.has_event_assignment(auth.uid(), event_id, 'validador'));

-- AUDIT_LOGS — solo admin lee; cualquier autenticado puede insertar
create policy audit_admin_select on public.audit_logs
  for select to authenticated
  using (public.is_admin(auth.uid()));
create policy audit_insert_auth on public.audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin(auth.uid()));
