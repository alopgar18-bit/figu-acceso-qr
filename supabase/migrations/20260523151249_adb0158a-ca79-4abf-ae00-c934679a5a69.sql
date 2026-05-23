
-- Revoke broad EXECUTE from PUBLIC/anon on all SECURITY DEFINER functions,
-- keep grants only where signed-in users legitimately need them.

-- Trigger-only functions: no API caller should invoke these directly
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_brand_profiles_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_confirmation_token() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: needed by authenticated users for policy evaluation
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_event_assignment(uuid, uuid, assignment_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_session_assignment(uuid, uuid, assignment_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_user_has_event(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_assignment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_assignment(uuid, uuid, assignment_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_session_assignment(uuid, uuid, assignment_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_user_has_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

-- Admin-gated functions: self-check is_admin(auth.uid()); restrict to authenticated
REVOKE EXECUTE ON FUNCTION public.anonymize_person(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_communication_logs(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_communication_logs(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_import_batch(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_participants(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_tickets(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.anonymize_person(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_communication_logs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_communication_logs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_import_batch(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_participants(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tickets(uuid[]) TO authenticated;

-- log_audit: callable by signed-in users only (records actor via auth.uid())
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, uuid, uuid, jsonb) TO authenticated;
