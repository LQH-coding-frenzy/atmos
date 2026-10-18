-- Correct the preference RPC row expansion without changing its signature or data.
-- Kept as a follow-up because the initial additive migration has already been applied
-- to local validation databases.
create or replace function public.replace_saved_location_preferences(
  p_preferences jsonb,
  p_default_location_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  requested_count integer;
  owned_count integer;
  distinct_count integer;
  preference record;
  affected_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) is distinct from 'array' then
    raise exception 'Saved-place preferences must be an array.' using errcode = '22023';
  end if;
  requested_count := jsonb_array_length(p_preferences);
  if requested_count > 100 then
    raise exception 'At most 100 saved places may be updated.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_preferences) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or jsonb_typeof(item.value -> 'id') is distinct from 'string'
       or (item.value ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(item.value -> 'is_favorite') is distinct from 'boolean'
       or (item.value ? 'category') is not true
       or (jsonb_typeof(item.value -> 'category') not in ('null', 'string')) is true
       or coalesce(item.value ->> 'category', 'null') not in ('null', 'home', 'work', 'university', 'travel')
  ) then
    raise exception 'A saved-place preference is malformed.' using errcode = '22023';
  end if;

  select count(*) into distinct_count
  from (select distinct value ->> 'id' as id from jsonb_array_elements(p_preferences) as item(value)) as submitted;
  if distinct_count <> requested_count then
    raise exception 'Saved-place IDs must be unique.' using errcode = '22023';
  end if;

  select count(*) into owned_count from public.saved_locations where user_id = actor_id;
  if requested_count <> owned_count or exists (
    select 1 from jsonb_array_elements(p_preferences) as item(value)
    where not exists (
      select 1 from public.saved_locations as locations
      where locations.user_id = actor_id and locations.id = (item.value ->> 'id')::uuid
    )
  ) then
    raise exception 'The preference set must contain exactly the caller’s saved places.' using errcode = '42501';
  end if;
  if p_default_location_id is not null and not exists (
    select 1 from jsonb_array_elements(p_preferences) as item(value)
    where (item.value ->> 'id')::uuid = p_default_location_id
  ) then
    raise exception 'The default place must be in the saved-place preference set.' using errcode = '22023';
  end if;

  update public.saved_locations set is_default = false where user_id = actor_id and is_default;
  for preference in
    select (item.value ->> 'id')::uuid as id,
           (item.value ->> 'is_favorite')::boolean as is_favorite,
           nullif(item.value ->> 'category', 'null') as category,
           item.ordinality as position
    from jsonb_array_elements(p_preferences) with ordinality as item(value, ordinality)
  loop
    update public.saved_locations
    set is_favorite = preference.is_favorite,
        category = preference.category,
        sort_order = (preference.position - 1)::integer,
        is_default = preference.id = p_default_location_id,
        updated_at = now()
    where user_id = actor_id and id = preference.id;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception 'A saved place changed during the update.' using errcode = '40001';
    end if;
  end loop;

  update public.user_preferences
  set saved_place_preferences_initialized = true, updated_at = now()
  where user_id = actor_id;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Account preferences are unavailable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.replace_saved_location_preferences(jsonb, uuid) from public, anon;
grant execute on function public.replace_saved_location_preferences(jsonb, uuid) to authenticated;
