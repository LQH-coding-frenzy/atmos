create table public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  observed_at timestamptz not null,
  provider text not null check (char_length(provider) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, latitude, longitude, observed_at, provider)
);

create index weather_snapshots_user_observed_at_idx
  on public.weather_snapshots (user_id, observed_at desc);

alter table public.weather_snapshots enable row level security;

grant select, insert, delete on public.weather_snapshots to authenticated;
revoke update on public.weather_snapshots from authenticated;

create policy "weather_snapshots_select_own" on public.weather_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weather_snapshots_insert_own" on public.weather_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weather_snapshots_delete_own" on public.weather_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);
