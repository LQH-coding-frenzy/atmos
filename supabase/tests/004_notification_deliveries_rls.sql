begin;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'delivery-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'delivery-b@example.test', '', '{}', '{}', now(), now());

insert into public.notification_deliveries (id, user_id, event_id, kind, channel) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000001', 'weather-alert', 'in-app'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000002', 'weather-alert', 'email');

select has_table('public', 'notification_deliveries', 'notification deliveries table exists');
select has_column('public', 'notification_deliveries', 'provider_message_key', 'delivery idempotency key exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notification_deliveries'::regclass),
  'notification deliveries RLS is enabled'
);
select ok(has_table_privilege('authenticated', 'public.notification_deliveries', 'select'), 'authenticated can select own delivery state');
select ok(not has_table_privilege('authenticated', 'public.notification_deliveries', 'insert'), 'authenticated cannot create deliveries');
select ok(not has_table_privilege('authenticated', 'public.notification_deliveries', 'update'), 'authenticated cannot change delivery state');
select ok(not has_table_privilege('authenticated', 'public.notification_deliveries', 'delete'), 'authenticated cannot delete delivery state');
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_deliveries' and policyname = 'notification_deliveries_select_own'),
  'notification deliveries have own select policy'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', true);
set local role authenticated;

select is(
  (select count(*) from public.notification_deliveries where id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A can select own delivery'
);
select is_empty(
  $$select * from public.notification_deliveries where id = '30000000-0000-0000-0000-000000000002'$$,
  'user A cannot select user B delivery'
);
select throws_ok(
  $$insert into public.notification_deliveries (user_id, event_id, kind, channel) values ('00000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000003', 'weather-alert', 'push')$$,
  '42501',
  null,
  'user A cannot create a delivery'
);
select throws_ok(
  $$update public.notification_deliveries set status = 'delivered' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'user A cannot update a delivery'
);

select * from finish();
rollback;
