begin;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'location-a@example.test', '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000042', 'authenticated', 'authenticated', 'location-b@example.test', '', '{}', '{}', now(), now());
insert into public.saved_locations (id, user_id, name, latitude, longitude) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'A', 1, 1),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000042', 'B', 2, 2);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
set local role authenticated;
select ok((select relrowsecurity from pg_class where oid = 'public.saved_locations'::regclass), 'RLS enabled');
select is((select count(*) from public.saved_locations), 1::bigint, 'owner sees one location');
select is_empty($$select * from public.saved_locations where id = '50000000-0000-0000-0000-000000000002'$$, 'cross-user select denied');
select lives_ok($$insert into public.saved_locations (user_id, name, latitude, longitude) values ('00000000-0000-0000-0000-000000000041', 'C', 3, 3)$$, 'owner can insert');
select throws_ok($$insert into public.saved_locations (user_id, name, latitude, longitude) values ('00000000-0000-0000-0000-000000000042', 'D', 4, 4)$$, '42501', null, 'cross-user insert denied');
select lives_ok($$update public.saved_locations set name = 'nope' where id = '50000000-0000-0000-0000-000000000002'$$, 'cross-user update is a no-op');
reset role;
select is((select name from public.saved_locations where id = '50000000-0000-0000-0000-000000000002'), 'B', 'cross-user update leaves row unchanged');
select * from finish();
rollback;
