begin;
select plan(20);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'user-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'user-b@example.test', '', '{}', '{}', now(), now());

select ok(
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'user A profile fixture exists'
);
select ok(
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000002'),
  'user B profile fixture exists'
);
select ok(
  exists (select 1 from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000001'),
  'user A preferences fixture exists'
);
select ok(
  exists (select 1 from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000002'),
  'user B preferences fixture exists'
);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'user_preferences', 'user preferences table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass),
  'preferences RLS is enabled'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'),
  'profiles have own select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'),
  'profiles have own update policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_preferences' and policyname = 'preferences_select_own'),
  'preferences have own select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_preferences' and policyname = 'preferences_update_own'),
  'preferences have own update policy'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A can select own profile'
);
select is_empty(
  $$select * from public.profiles where id = '00000000-0000-0000-0000-000000000002'$$,
  'user A cannot select user B profile'
);
select is_empty(
  $$update public.profiles set display_name = 'Blocked' where id = '00000000-0000-0000-0000-000000000002' returning id$$,
  'user A cannot update user B profile'
);
select is_empty(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-000000000002' returning id$$,
  'user A cannot delete user B profile'
);
select is(
  (select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A can select own preferences'
);
select is_empty(
  $$select * from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000002'$$,
  'user A cannot select user B preferences'
);
select is_empty(
  $$update public.user_preferences set theme = 'dark' where user_id = '00000000-0000-0000-0000-000000000002' returning user_id$$,
  'user A cannot update user B preferences'
);
select is_empty(
  $$delete from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000002' returning user_id$$,
  'user A cannot delete user B preferences'
);

select * from finish();
rollback;
