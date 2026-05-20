REVOKE EXECUTE ON FUNCTION public.anonymize_person(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_person(uuid, text) TO authenticated;