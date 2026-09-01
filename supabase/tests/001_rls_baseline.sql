begin;
select plan(8);

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

select * from finish();
rollback;
