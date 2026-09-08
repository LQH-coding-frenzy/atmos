create table public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, latitude, longitude)
);

create index saved_locations_user_created_at_idx
  on public.saved_locations (user_id, created_at desc);

alter table public.saved_locations enable row level security;

grant select, insert, update, delete on public.saved_locations to authenticated;

create policy "saved_locations_select_own" on public.saved_locations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_locations_insert_own" on public.saved_locations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_locations_update_own" on public.saved_locations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_locations_delete_own" on public.saved_locations
  for delete to authenticated using ((select auth.uid()) = user_id);
