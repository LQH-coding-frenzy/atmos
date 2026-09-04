begin;
select plan(19);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'alert-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'alert-b@example.test', '', '{}', '{}', now(), now());

insert into public.alert_rules (id, user_id, location_id, conditions, schedule, notification_channels) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'berlin-de', '[{"metric":"temperature","comparison":"above","value":30}]', '{"weekdays":["monday"],"cooldownMinutes":60}', array['in-app']),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000022', 'paris-fr', '[{"metric":"rain-probability","comparison":"above","value":70}]', '{"weekdays":["tuesday"],"cooldownMinutes":30}', array['email']);

select has_table('public', 'alert_rules', 'alert rules table exists');
select has_column('public', 'alert_rules', 'conditions', 'alert rules retain conditions');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.alert_rules'::regclass),
  'alert rules RLS is enabled'
);
select ok(has_table_privilege('authenticated', 'public.alert_rules', 'select'), 'authenticated can select alert rules');
select ok(has_table_privilege('authenticated', 'public.alert_rules', 'insert'), 'authenticated can insert alert rules');
select ok(has_table_privilege('authenticated', 'public.alert_rules', 'update'), 'authenticated can update alert rules');
select ok(has_table_privilege('authenticated', 'public.alert_rules', 'delete'), 'authenticated can delete alert rules');
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'alert_rules_select_own'),
  'alert rules have own select policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'alert_rules_insert_own'),
  'alert rules have own insert policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'alert_rules_update_own'),
  'alert rules have own update policy'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_rules' and policyname = 'alert_rules_delete_own'),
  'alert rules have own delete policy'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
set local role authenticated;

select is(
  (select count(*) from public.alert_rules where id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A can select own alert rule'
);
select is_empty(
  $$select * from public.alert_rules where id = '20000000-0000-0000-0000-000000000002'$$,
  'user A cannot select user B alert rule'
);
select lives_ok(
  $$insert into public.alert_rules (user_id, location_id, conditions, schedule, notification_channels) values ('00000000-0000-0000-0000-000000000021', 'berlin-de', '[{"metric":"wind","comparison":"above","value":40}]', '{"weekdays":["friday"],"cooldownMinutes":15}', array['push'])$$,
  'user A can insert own alert rule'
);
select throws_ok(
  $$insert into public.alert_rules (user_id, location_id, conditions, schedule, notification_channels) values ('00000000-0000-0000-0000-000000000022', 'paris-fr', '[{"metric":"aqi","comparison":"above","value":100}]', '{"weekdays":["friday"],"cooldownMinutes":15}', array['push'])$$,
  '42501',
  null,
  'user A cannot insert user B alert rule'
);
select lives_ok(
  $$update public.alert_rules set enabled = false where id = '20000000-0000-0000-0000-000000000001'$$,
  'user A can update own alert rule'
);
select is_empty(
  $$update public.alert_rules set enabled = false where id = '20000000-0000-0000-0000-000000000002' returning id$$,
  'user A cannot update user B alert rule'
);
select lives_ok(
  $$delete from public.alert_rules where id = '20000000-0000-0000-0000-000000000001'$$,
  'user A can delete own alert rule'
);
select is_empty(
  $$delete from public.alert_rules where id = '20000000-0000-0000-0000-000000000002' returning id$$,
  'user A cannot delete user B alert rule'
);

select * from finish();
rollback;
