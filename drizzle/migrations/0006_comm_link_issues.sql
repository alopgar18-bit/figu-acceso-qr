CREATE OR REPLACE FUNCTION public.comm_link_issues(_channels text[], _ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'checked', count(*),
    'unresolved', count(*) FILTER (WHERE coalesce(body,'') ~ '\{\{' OR coalesce(subject,'') ~ '\{\{'),
    'empty_links', count(*) FILTER (WHERE coalesce(body,'') ~ 'href=""' OR coalesce(body,'') ~ 'href="#"')
  ) INTO r
  FROM public.communication_logs l
  WHERE l.status IN ('programado','pendiente')
    AND l.archived_at IS NULL
    AND l.channel::text = ANY(_channels)
    AND (_ids IS NULL OR l.id = ANY(_ids));
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.comm_link_issues(text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comm_link_issues(text[], uuid[]) TO authenticated;