create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_rule_id uuid not null references public.alert_rules(id) on delete cascade,
  evaluated_window timestamptz not null,
  condition_fingerprint text not null check (char_length(condition_fingerprint) between 1 and 128),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (alert_rule_id, evaluated_window, condition_fingerprint)
);

create index alert_events_user_created_at_idx on public.alert_events (user_id, created_at desc);

alter table public.alert_events enable row level security;

revoke all on public.alert_events from authenticated;
grant select on public.alert_events to authenticated;

create policy "alert_events_select_own" on public.alert_events
  for select to authenticated using ((select auth.uid()) = user_id);
