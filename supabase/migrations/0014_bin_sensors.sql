-- IoT bin fill sensors (ESP32 + ultrasonic probe in the lid).
-- A sensor belongs to one household. It posts its measured distance to the API
-- (POST /iot/readings with its device key); the API turns distance into fill %
-- using the per-bin calibration below and opens a 'bin_full' report at the full line.

alter type public.channel add value if not exists 'sensor';

create table public.bin_sensors (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households (id) on delete cascade,
  key_hash text not null unique,               -- sha256 of the device key; the key itself is shown once
  empty_cm real not null default 60,           -- probe → bin bottom (reading when the bin is empty)
  full_cm real not null default 25,            -- probe → waste when the bin counts as full (≥ probe blind zone)
  last_distance_cm real,
  last_fill_pct real,
  last_battery_v real,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (full_cm > 0 and empty_cm > full_cm)
);

create table public.sensor_readings (
  id bigserial primary key,
  sensor_id uuid not null references public.bin_sensors (id) on delete cascade,
  distance_cm real,                            -- null when the probe got no echo
  fill_pct real,
  battery_v real,
  rssi int,
  created_at timestamptz not null default now()
);
create index on public.sensor_readings (sensor_id, created_at desc);

alter table public.bin_sensors enable row level security;
alter table public.sensor_readings enable row level security;

-- Read-only from the apps; every write goes through the API (service role).
create policy "see bin sensors" on public.bin_sensors for select to authenticated
  using (public.can_see_household(household_id));
create policy "see sensor readings" on public.sensor_readings for select to authenticated
  using (exists (select 1 from public.bin_sensors s where s.id = sensor_id and public.can_see_household(s.household_id)));

-- Never expose the key hash to clients.
revoke all on public.bin_sensors from anon, authenticated;
grant select (id, household_id, empty_cm, full_cm, last_distance_cm, last_fill_pct, last_battery_v, last_seen_at, created_at)
  on public.bin_sensors to authenticated;
revoke all on public.sensor_readings from anon, authenticated;
grant select on public.sensor_readings to authenticated;

alter publication supabase_realtime add table public.bin_sensors;
