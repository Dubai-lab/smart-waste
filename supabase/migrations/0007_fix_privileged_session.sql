-- Inside SECURITY DEFINER functions current_user is the owner (postgres), so it cannot identify the caller.
-- Use the request's JWT role instead: API requests carry 'anon' / 'authenticated' / 'service_role';
-- direct database sessions (migrations, pg_cron) have no JWT at all.
create or replace function public.is_privileged_session() returns boolean
language sql stable as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
$$;
