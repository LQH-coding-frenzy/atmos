alter table public.alert_rules
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180);

create index alert_rules_enabled_coordinates_idx
  on public.alert_rules (enabled)
  where latitude is not null and longitude is not null;
