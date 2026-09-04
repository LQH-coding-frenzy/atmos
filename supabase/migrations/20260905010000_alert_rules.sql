create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id text not null check (char_length(location_id) between 1 and 120),
  conditions jsonb not null check (
    jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) between 1 and 10
  ),
  schedule jsonb not null check (
    jsonb_typeof(schedule) = 'object' and schedule ? 'weekdays' and schedule ? 'cooldownMinutes'
  ),
  notification_channels text[] not null check (
    cardinality(notification_channels) between 1 and 3
    and notification_channels <@ array['in-app', 'email', 'push']::text[]
  ),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index alert_rules_user_enabled_idx on public.alert_rules (user_id, enabled);

alter table public.alert_rules enable row level security;

grant select, insert, update, delete on public.alert_rules to authenticated;

create policy "alert_rules_select_own" on public.alert_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "alert_rules_insert_own" on public.alert_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alert_rules_update_own" on public.alert_rules
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "alert_rules_delete_own" on public.alert_rules
  for delete to authenticated using ((select auth.uid()) = user_id);
