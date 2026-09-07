create or replace function public.comm_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _email int;
  _wa int;
  _unauth int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select count(*) into _email from public.communication_logs
   where channel = 'email' and status in ('programado','pendiente');

  select count(*) into _wa from public.communication_logs
   where channel in ('whatsapp_business','whatsapp_asistido') and status in ('programado','pendiente');

  select count(*) into _unauth from public.communication_logs
   where channel in ('whatsapp_business','whatsapp_asistido')
     and status = 'fallido' and error_message = 'wati_unauthorized';

  return jsonb_build_object('email', _email, 'whatsapp', _wa, 'wati_unauthorized', _unauth);
end;
$$;

create or replace function public.comm_authorize_queue(_channels text[], _ids uuid[] default null)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  update public.communication_logs
     set status = 'pendiente'
   where channel::text = any(_channels)
     and status in ('programado','pendiente')
     and (_ids is null or id = any(_ids))
  returning id;
end;
$$;

grant execute on function public.comm_queue_counts() to authenticated;
grant execute on function public.comm_authorize_queue(text[], uuid[]) to authenticated;