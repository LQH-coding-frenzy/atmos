begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'event-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000042', 'authenticated', 'authenticated', 'event-b@example.test', '', '{}', '{}', now(), now());

insert into public.alert_rules (id, user_id, location_id, conditions, schedule, notification_channels) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'berlin-de', '[{"metric":"temperature","comparison":"above","value":30}]', '{"weekdays":["monday"],"cooldownMinutes":60}', array['in-app']),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000042', 'paris-fr', '[{"metric":"wind","comparison":"above","value":30}]', '{"weekdays":["tuesday"],"cooldownMinutes":60}', array['email']);

insert into public.alert_events (id, user_id, alert_rule_id, evaluated_window, condition_fingerprint, payload) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000001', '2026-09-07T00:00:00Z', 'temperature-above-30', '{"temperature":31}'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000042', '50000000-0000-0000-0000-000000000002', '2026-09-07T00:00:00Z', 'wind-above-30', '{"wind":35}');

select has_table('public', 'alert_events', 'alert events table exists');
select has_column('public', 'alert_events', 'condition_fingerprint', 'alert events retain condition fingerprint');
select ok((select relrowsecurity from pg_class where oid = 'public.alert_events'::regclass), 'alert events RLS is enabled');
select ok(has_table_privilege('authenticated', 'public.alert_events', 'select'), 'authenticated can select own events');
select ok(not has_table_privilege('authenticated', 'public.alert_events', 'insert'), 'authenticated cannot create events');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_events' and policyname = 'alert_events_select_own'), 'alert events have own select policy');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
set local role authenticated;

select is((select count(*) from public.alert_events where id = '60000000-0000-0000-0000-000000000001'), 1::bigint, 'user A can select own event');
select is_empty($$select * from public.alert_events where id = '60000000-0000-0000-0000-000000000002'$$, 'user A cannot select user B event');
select throws_ok($$insert into public.alert_events (user_id, alert_rule_id, evaluated_window, condition_fingerprint, payload) values ('00000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000001', '2026-09-07T00:00:00Z', 'temperature-above-30', '{}')$$, '42501', null, 'user A cannot create duplicate event');
select throws_ok($$insert into public.alert_events (user_id, alert_rule_id, evaluated_window, condition_fingerprint, payload) values ('00000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000001', '2026-09-07T01:00:00Z', 'temperature-above-30', '{}')$$, '42501', null, 'user A cannot create events');

select * from finish();
rollback;
