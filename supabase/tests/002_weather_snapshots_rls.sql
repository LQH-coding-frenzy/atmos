begin;
select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'snapshot-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'snapshot-b@example.test', '', '{}', '{}', now(), now());

insert into public.weather_snapshots (id, user_id, latitude, longitude, observed_at, provider, payload) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 52.52, 13.405, '2026-09-01T10:00:00Z', 'mock', '{"temperature_c": 20}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 48.8566, 2.3522, '2026-09-01T10:00:00Z', 'mock', '{"temperature_c": 18}');

select has_table('public', 'weather_snapshots', 'weather snapshots table exists');
select has_column('public', 'weather_snapshots', 'payload', 'weather snapshots retain a normalized payload');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.weather_snapshots'::regclass),
  'weather snapshots RLS is enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.weather_snapshots', 'select'),
  'authenticated can select snapshots'
);
select ok(
  has_table_privilege('authenticated', 'public.weather_snapshots', 'insert'),
  'authenticated can insert snapshots'
);
select ok(
  has_table_privilege('authenticated', 'public.weather_snapshots', 'delete'),
  'authenticated can delete snapshots'
);
select ok(
  not has_table_privilege('authenticated', 'public.weather_snapshots', 'update'),
  'authenticated cannot rewrite snapshots'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weather_snapshots' and policyname = 'weather_snapshots_select_own'),
  'weather snapshots have own select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weather_snapshots' and policyname = 'weather_snapshots_insert_own'),
  'weather snapshots have own insert policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weather_snapshots' and policyname = 'weather_snapshots_delete_own'),
  'weather snapshots have own delete policy'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
set local role authenticated;

select is(
  (select count(*) from public.weather_snapshots where id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A can select own snapshot'
);
select is_empty(
  $$select * from public.weather_snapshots where id = '10000000-0000-0000-0000-000000000002'$$,
  'user A cannot select user B snapshot'
);
select lives_ok(
  $$insert into public.weather_snapshots (user_id, latitude, longitude, observed_at, provider, payload) values ('00000000-0000-0000-0000-000000000011', 52.52, 13.405, '2026-09-01T11:00:00Z', 'mock', '{"temperature_c": 21}')$$,
  'user A can insert own snapshot'
);
select throws_ok(
  $$insert into public.weather_snapshots (user_id, latitude, longitude, observed_at, provider, payload) values ('00000000-0000-0000-0000-000000000012', 48.8566, 2.3522, '2026-09-01T11:00:00Z', 'mock', '{"temperature_c": 19}')$$,
  '42501',
  null,
  'user A cannot insert user B snapshot'
);
select is_empty(
  $$delete from public.weather_snapshots where id = '10000000-0000-0000-0000-000000000002' returning id$$,
  'user A cannot delete user B snapshot'
);

select * from finish();
rollback;
