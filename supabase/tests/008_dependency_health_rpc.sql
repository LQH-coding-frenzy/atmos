begin;
select plan(8);

select ok(
  to_regprocedure('public.atmos_dependency_health()') is not null,
  'dependency health function exists'
);
select is(
  (select prorettype from pg_proc where oid = 'public.atmos_dependency_health()'::regprocedure),
  'boolean'::regtype::oid,
  'dependency health function returns boolean'
);
select is(
  (select provolatile from pg_proc where oid = 'public.atmos_dependency_health()'::regprocedure),
  's'::"char",
  'dependency health function is stable'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.atmos_dependency_health()'::regprocedure),
  'dependency health function uses invoker security'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(proacl)
    where oid = 'public.atmos_dependency_health()'::regprocedure
      and grantee = 0
      and privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute dependency health'
);
select ok(
  has_function_privilege('anon', 'public.atmos_dependency_health()', 'EXECUTE'),
  'anonymous API role can execute dependency health'
);
select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(proacl)
    where oid = 'public.atmos_dependency_health()'::regprocedure
      and privilege_type = 'EXECUTE'
      and grantee not in (
        (select oid from pg_roles where rolname = 'anon'),
        proowner
      )
  ),
  'only the anonymous API role and function owner have direct execute grants'
);

set local role anon;
select is(public.atmos_dependency_health(), true, 'anonymous API role receives only true');

select * from finish();
rollback;
