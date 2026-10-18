begin;
select plan(23);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000091','authenticated','authenticated','place-pref-a@example.test','','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000092','authenticated','authenticated','place-pref-b@example.test','','{}','{}',now(),now());

insert into public.saved_locations(id,user_id,name,latitude,longitude) values
  ('59000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000091','A1',1,1),
  ('59000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000091','A2',2,2),
  ('59000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000092','B1',3,3);

select has_column('public','saved_locations','is_favorite','favorite state is persisted per saved location');
select has_column('public','saved_locations','category','saved location category is persisted');
select has_column('public','user_preferences','saved_place_preferences_initialized','legacy local preference sync is one-time');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='saved_locations_one_default_per_user_idx'),'at most one default is enforced per user');
select ok(not (select prosecdef from pg_proc where oid='public.replace_saved_location_preferences(jsonb,uuid)'::regprocedure),'preference replacement runs with invoker security');
select is((select sort_order from public.saved_locations where id='59000000-0000-0000-0000-000000000001'),0::integer,'existing places receive deterministic initial order');
select is((select category from public.saved_locations where id='59000000-0000-0000-0000-000000000001'),null::text,'existing categories start unset');
select is((select saved_place_preferences_initialized from public.user_preferences where user_id='00000000-0000-0000-0000-000000000091'),false,'legacy accounts begin eligible for local preference migration');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
set local role authenticated;

select is((select count(*) from public.saved_locations),2::bigint,'owner sees own saved locations only');
select is_empty($$select * from public.saved_locations where id='59000000-0000-0000-0000-000000000003'$$,'cross-user saved location is not visible');
select lives_ok($$select public.replace_saved_location_preferences(
  '[{"id":"59000000-0000-0000-0000-000000000002","is_favorite":true,"category":"travel"},{"id":"59000000-0000-0000-0000-000000000001","is_favorite":false,"category":"home"}]'::jsonb,
  '59000000-0000-0000-0000-000000000002')$$,'owner atomically syncs preference order, favorite, category and default');
select is((select sort_order from public.saved_locations where id='59000000-0000-0000-0000-000000000002'),0::integer,'requested order is saved');
select is((select category from public.saved_locations where id='59000000-0000-0000-0000-000000000002'),'travel','supported category is saved');
select ok((select is_favorite and is_default from public.saved_locations where id='59000000-0000-0000-0000-000000000002'),'favorite and default are saved');
select is((select saved_place_preferences_initialized from public.user_preferences where user_id='00000000-0000-0000-0000-000000000091'),true,'successful sync marks migration initialized');
select throws_ok($$select public.replace_saved_location_preferences(
  '[{"id":"59000000-0000-0000-0000-000000000003","is_favorite":true,"category":"home"}]'::jsonb,
  '59000000-0000-0000-0000-000000000003')$$,'42501',null,'caller cannot replace preferences with another user location');
select throws_ok($$select public.replace_saved_location_preferences(
  '[{"id":"59000000-0000-0000-0000-000000000001","is_favorite":false,"category":"admin"},{"id":"59000000-0000-0000-0000-000000000002","is_favorite":true,"category":"travel"}]'::jsonb,
  '59000000-0000-0000-0000-000000000002')$$,'22023',null,'unsupported category is rejected');
select throws_ok($$select public.replace_saved_location_preferences(
  '[{"id":"59000000-0000-0000-0000-000000000001","is_favorite":false,"category":null},{"id":"59000000-0000-0000-0000-000000000001","is_favorite":true,"category":null}]'::jsonb,
  null)$$,'22023',null,'duplicate location IDs are rejected');
select throws_ok($$select public.replace_saved_location_preferences(
  '[{"id":"59000000-0000-0000-0000-000000000001","is_favorite":false,"category":null},{"id":"59000000-0000-0000-0000-000000000002","is_favorite":true,"category":"travel"}]'::jsonb,
  '59000000-0000-0000-0000-000000000003')$$,'22023',null,'default ID outside the submitted set is rejected');
select throws_ok($$select public.replace_saved_location_preferences('{}'::jsonb,null)$$,'22023',null,'non-array preferences are rejected');
select throws_ok($$update public.saved_locations set is_default=true where id='59000000-0000-0000-0000-000000000001'$$,'23505',null,'unique default index prevents two defaults per owner');
select is_empty($$update public.saved_locations set is_favorite=true where id='59000000-0000-0000-0000-000000000003' returning id$$,'cross-user metadata update is denied');

reset role;
select is((select category from public.saved_locations where id='59000000-0000-0000-0000-000000000003'),null::text,'cross-user update leaves other account preference unchanged');
select * from finish();
rollback;
