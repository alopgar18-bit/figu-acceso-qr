REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_event_assignment(uuid, uuid, public.assignment_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_session_assignment(uuid, uuid, public.assignment_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_user_has_event(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_assignment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_assignment(uuid, uuid, public.assignment_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_session_assignment(uuid, uuid, public.assignment_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_user_has_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, uuid, uuid, jsonb) TO authenticated;