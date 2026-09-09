begin;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000091', 'authenticated', 'authenticated', 'attacker@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000092', 'authenticated', 'authenticated', 'victim@example.test', '', '{}', '{}', now(), now());

insert into public.saved_locations (id, user_id, name, latitude, longitude) values
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000091', 'Attacker location', 1, 1),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000092', 'Victim location', 2, 2);
insert into public.alert_rules (id, user_id, location_id, conditions, schedule, notification_channels) values
  ('72000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000091', 'attacker-location', '[{"metric":"temperature","comparison":"above","value":30}]', '{"weekdays":["monday"],"cooldownMinutes":60}', array['in-app']),
  ('72000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000092', 'victim-location', '[{"metric":"wind","comparison":"above","value":30}]', '{"weekdays":["tuesday"],"cooldownMinutes":60}', array['email']);
insert into public.alert_events (id, user_id, alert_rule_id, evaluated_window, condition_fingerprint, payload) values
  ('73000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000091', '72000000-0000-4000-8000-000000000001', '2026-09-09T00:00:00Z', 'attacker-event', '{}'),
  ('73000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000092', '72000000-0000-4000-8000-000000000002', '2026-09-09T00:00:00Z', 'victim-event', '{}');
insert into public.notification_deliveries (id, user_id, event_id, kind, channel) values
  ('74000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000091', '73000000-0000-4000-8000-000000000001', 'weather-alert', 'in-app'),
  ('74000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000092', '73000000-0000-4000-8000-000000000002', 'weather-alert', 'email');
insert into public.weather_snapshots (id, user_id, latitude, longitude, observed_at, provider, payload) values
  ('75000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000091', 1, 1, '2026-09-09T00:00:00Z', 'mock', '{}'),
  ('75000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000092', 2, 2, '2026-09-09T00:00:00Z', 'mock', '{}');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true);
set local role authenticated;

select is((select count(*) from public.profiles), 1::bigint, 'attacker sees only own profile');
select is_empty($$select * from public.profiles where id = '00000000-0000-0000-0000-000000000092'$$, 'attacker cannot read victim profile');
select is_empty($$select * from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000092'$$, 'attacker cannot read victim preferences');
select is_empty($$update public.profiles set display_name = 'compromised' where id = '00000000-0000-0000-0000-000000000092' returning id$$, 'attacker cannot update victim profile');
select is_empty($$delete from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000092' returning user_id$$, 'attacker cannot delete victim preferences');
select throws_ok($$insert into public.saved_locations (user_id, name, latitude, longitude) values ('00000000-0000-0000-0000-000000000092', 'Forged', 3, 3)$$, '42501', null, 'attacker cannot forge victim saved location ownership');
select throws_ok($$update public.saved_locations set user_id = '00000000-0000-0000-0000-000000000092' where id = '71000000-0000-4000-8000-000000000001'$$, '42501', null, 'attacker cannot reassign own saved location to victim');
select is_empty($$update public.saved_locations set name = 'compromised' where id = '71000000-0000-4000-8000-000000000002' returning id$$, 'attacker cannot update victim saved location');
select is_empty($$delete from public.saved_locations where id = '71000000-0000-4000-8000-000000000002' returning id$$, 'attacker cannot delete victim saved location');
select throws_ok($$insert into public.alert_rules (user_id, location_id, conditions, schedule, notification_channels) values ('00000000-0000-0000-0000-000000000092', 'forged', '[{"metric":"aqi","comparison":"above","value":100}]', '{"weekdays":["friday"],"cooldownMinutes":15}', array['push'])$$, '42501', null, 'attacker cannot forge victim alert rule ownership');
select throws_ok($$update public.alert_rules set user_id = '00000000-0000-0000-0000-000000000092' where id = '72000000-0000-4000-8000-000000000001'$$, '42501', null, 'attacker cannot reassign own alert rule to victim');
select is_empty($$select * from public.alert_events where id = '73000000-0000-4000-8000-000000000002'$$, 'attacker cannot read victim alert event');
select is_empty($$select * from public.notification_deliveries where id = '74000000-0000-4000-8000-000000000002'$$, 'attacker cannot read victim delivery');
select throws_ok($$update public.notification_deliveries set status = 'delivered' where id = '74000000-0000-4000-8000-000000000001'$$, '42501', null, 'attacker cannot mutate internal delivery state');
select is_empty($$select * from public.weather_snapshots where id = '75000000-0000-4000-8000-000000000002'$$, 'attacker cannot read victim weather snapshot');
select throws_ok($$update public.weather_snapshots set payload = '{"compromised":true}' where id = '75000000-0000-4000-8000-000000000001'$$, '42501', null, 'attacker cannot rewrite own immutable snapshot');

reset role;
select is((select name from public.saved_locations where id = '71000000-0000-4000-8000-000000000002'), 'Victim location', 'victim data remains unchanged after attacks');
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is_empty($$select * from public.profiles$$, 'authenticated role without a subject sees no user records');

select * from finish();
rollback;
