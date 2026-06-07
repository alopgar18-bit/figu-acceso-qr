-- Add ticket_design jsonb to events for customizing QR ticket page (colors, notices, footer)
alter table public.events
  add column if not exists ticket_design jsonb not null default '{}'::jsonb;
