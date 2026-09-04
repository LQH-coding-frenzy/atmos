create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null,
  kind text not null check (kind in ('weather-alert')),
  channel text not null check (channel in ('in-app', 'email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_key text unique check (provider_message_key is null or char_length(provider_message_key) between 1 and 255),
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id, channel)
);

create index notification_deliveries_user_created_at_idx
  on public.notification_deliveries (user_id, created_at desc);

alter table public.notification_deliveries enable row level security;

revoke all on public.notification_deliveries from authenticated;
grant select on public.notification_deliveries to authenticated;

create policy "notification_deliveries_select_own" on public.notification_deliveries
  for select to authenticated using ((select auth.uid()) = user_id);
