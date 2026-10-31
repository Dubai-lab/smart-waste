-- One row per zone per planning run: evidence for "distance/time/fuel saved vs fixed routes".
create table public.plan_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  zone_id uuid references public.zones (id) on delete cascade,
  model_version text not null,
  distance_source text not null,           -- osrm | estimate
  households_total int not null,
  households_selected int not null,
  households_reported int not null,
  unassigned int not null default 0,
  routes int not null,
  distance_m int not null,
  duration_s int not null,
  baseline_distance_m int not null,
  baseline_duration_s int not null,
  fuel_saved_l numeric not null,
  co2_saved_kg numeric not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.plan_runs (run_date desc);
alter table public.plan_runs enable row level security;
create policy "see plan runs" on public.plan_runs for select to authenticated using (public.is_staff() or public.is_officer());
create policy "staff insert plan runs" on public.plan_runs for insert to authenticated with check (public.is_staff());
create policy "admin update plan runs" on public.plan_runs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete plan runs" on public.plan_runs for delete to authenticated using (public.is_admin());

insert into public.settings (key, value, description) values
  ('route_start_time', '"07:00"', 'Time the trucks leave the depot (Kigali time)'),
  ('service_seconds_per_stop', '90', 'Average time to empty one bin'),
  ('max_days_without_pickup', '14', 'Households are always included after this many days')
on conflict (key) do nothing;

-- lat/lng convenience view for clients (PostgREST returns geography as hex otherwise)
create view public.households_geo with (security_invoker = true) as
  select h.*, st_y(h.location::extensions.geometry) as lat, st_x(h.location::extensions.geometry) as lng
  from public.households h;
create view public.zones_geo with (security_invoker = true) as
  select z.id, z.name, z.color, z.sector, z.collection_weekdays, z.created_at,
         st_y(z.depot::extensions.geometry) as depot_lat, st_x(z.depot::extensions.geometry) as depot_lng,
         st_asgeojson(z.boundary::extensions.geometry)::jsonb as boundary_geojson
  from public.zones z;
