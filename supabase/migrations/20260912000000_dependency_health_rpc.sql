create function public.atmos_dependency_health()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function public.atmos_dependency_health() from public, authenticated, service_role;
grant execute on function public.atmos_dependency_health() to anon;
