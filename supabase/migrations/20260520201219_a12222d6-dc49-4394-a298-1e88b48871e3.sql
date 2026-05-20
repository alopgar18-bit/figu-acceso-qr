
-- Auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security-definer RPC the client can call to get its own roles reliably
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE(role app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

-- Backfill: ensure all auth.users have a profiles row
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
