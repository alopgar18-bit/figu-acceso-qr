
create type public.incident_category as enum ('entrada','otra');

alter table public.incidents
  add column category public.incident_category not null default 'entrada',
  add column walk_in_first_name text,
  add column walk_in_last_name text,
  add column walk_in_dni text,
  add column walk_in_companions integer not null default 0;

alter type public.incident_type add value if not exists 'no_recibio_qr';
alter type public.incident_type add value if not exists 'sin_movil';
alter type public.incident_type add value if not exists 'invitado_extra';
alter type public.incident_type add value if not exists 'perdida_objeto';
alter type public.incident_type add value if not exists 'problema_salud';
alter type public.incident_type add value if not exists 'conflicto_personal';
alter type public.incident_type add value if not exists 'queja';
alter type public.incident_type add value if not exists 'otro';
