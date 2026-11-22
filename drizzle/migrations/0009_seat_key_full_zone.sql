CREATE OR REPLACE FUNCTION public.seat_physical_key(_zone text, _row text, _num text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  select regexp_replace(upper(translate(btrim(coalesce(_zone,'')), 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU')), '\s+', ' ', 'g')
         || '|' || lower(btrim(_row)) || '|' || btrim(_num)
$function$;