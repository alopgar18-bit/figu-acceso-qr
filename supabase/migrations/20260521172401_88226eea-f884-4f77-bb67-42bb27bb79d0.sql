
REVOKE EXECUTE ON FUNCTION public.admin_delete_participants(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_import_batch(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_tickets(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_archive_communication_logs(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_communication_logs(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_delete_participants(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_import_batch(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tickets(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_communication_logs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_communication_logs(uuid[]) TO authenticated;
