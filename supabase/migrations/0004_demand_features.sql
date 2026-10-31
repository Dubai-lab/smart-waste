-- Demand prediction ("virtual smart bin").
-- One feature definition shared by training (Python) and inference (API).

create table public.ml_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. 'demand'
  version text not null,
  algorithm text not null,           -- logistic_regression | random_forest | gradient_boosting
  format text not null,              -- 'logreg' | 'trees'
  payload jsonb not null,            -- coefficients or tree arrays
  features text[] not null,
  metrics jsonb not null default '{}',
  trained_rows int,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (name, version)
);
alter table public.ml_models enable row level security;
create policy "staff read models" on public.ml_models for select to authenticated using (public.is_staff() or public.is_officer());
create policy "admin insert models" on public.ml_models for insert to authenticated with check (public.is_admin());
create policy "admin update models" on public.ml_models for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete models" on public.ml_models for delete to authenticated using (public.is_admin());

create or replace function public.fill_score(f public.fill_level) returns int
language sql immutable as $$
  select case f when 'empty' then 0 when 'quarter' then 1 when 'half' then 2 when 'full' then 3 else 4 end
$$;

-- Umuganda = last Saturday of the month
create or replace function public.is_umuganda(d date) returns boolean
language sql immutable as $$
  select extract(isodow from d) = 6 and extract(month from d + 7) <> extract(month from d)
$$;

-- Features for every active household (or one household) as of the start of day p_date.
create or replace function public.demand_features(p_date date, p_household uuid default null)
returns table (
  household_id uuid,
  zone_id uuid,
  household_size int,
  days_since_pickup real,
  reports_since_pickup int,
  extra_requested int,
  dow int,
  is_weekend int,
  holiday_recent int,
  umuganda_recent int,
  last_fill real,
  avg_fill real,
  fill_rate real,
  expected_fill real,
  history_n int
)
language sql stable security definer set search_path = public as $$
  with cutoff as (select (p_date::timestamp at time zone 'Africa/Kigali') as ts),
  hh as (
    select h.* from public.households h
    where h.active and (p_household is null or h.id = p_household)
  ),
  hist as (   -- valid pickups before the cutoff, newest first
    select p.household_id, p.scanned_at, public.fill_score(p.fill_level) as score,
           row_number() over (partition by p.household_id order by p.scanned_at desc) as rn,
           lead(p.scanned_at) over (partition by p.household_id order by p.scanned_at desc) as prev_at
    from public.pickups p, cutoff
    where p.valid and p.scanned_at < cutoff.ts
      and (p_household is null or p.household_id = p_household)
  ),
  agg as (
    select household_id,
           max(scanned_at) filter (where rn = 1) as last_at,
           max(score) filter (where rn = 1)::real as last_fill,
           avg(score) filter (where rn <= 5)::real as avg_fill,
           -- fill units per day across the last 5 intervals
           avg(score / greatest(extract(epoch from (scanned_at - prev_at)) / 86400.0, 0.5))
             filter (where rn <= 5 and prev_at is not null)::real as fill_rate,
           count(*)::int as n
    from hist group by household_id
  )
  select
    hh.id, hh.zone_id, hh.size,
    least(extract(epoch from ((select ts from cutoff) - coalesce(a.last_at, hh.created_at))) / 86400.0, 30)::real,
    (select count(*) from public.bin_reports r, cutoff
       where r.household_id = hh.id and r.type = 'bin_full' and r.status <> 'cancelled'
         and r.created_at < cutoff.ts and r.created_at > coalesce(a.last_at, '-infinity'))::int,
    (select count(*) from public.bin_reports r, cutoff
       where r.household_id = hh.id and r.type = 'extra_pickup' and r.status <> 'cancelled'
         and r.created_at < cutoff.ts and r.created_at > coalesce(a.last_at, '-infinity'))::int,
    extract(isodow from p_date)::int,
    (extract(isodow from p_date) >= 6)::int,
    (exists (select 1 from public.holidays x where x.day between p_date - 3 and p_date))::int,
    (exists (select 1 from generate_series(p_date - 3, p_date - 1, interval '1 day') g where public.is_umuganda(g::date)))::int,
    coalesce(a.last_fill, -1),
    coalesce(a.avg_fill, -1),
    coalesce(a.fill_rate, -1),
    case when a.fill_rate is null then -1
         else least(a.fill_rate * least(extract(epoch from ((select ts from cutoff) - a.last_at)) / 86400.0, 30), 8) end::real,
    coalesce(a.n, 0)
  from hh left join agg a on a.household_id = hh.id
$$;
revoke execute on function public.demand_features(date, uuid) from public, anon;

-- Training set: one row per valid pickup, features as of that pickup's day, label = bin was full/overflowing.
create or replace function public.demand_training_set()
returns table (
  pickup_id uuid, pickup_date date, household_id uuid, household_size int, days_since_pickup real,
  reports_since_pickup int, extra_requested int, dow int, is_weekend int, holiday_recent int, umuganda_recent int,
  last_fill real, avg_fill real, fill_rate real, expected_fill real, history_n int, label int, is_simulated boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, (p.scanned_at at time zone 'Africa/Kigali')::date, f.household_id, f.household_size, f.days_since_pickup,
         f.reports_since_pickup, f.extra_requested, f.dow, f.is_weekend, f.holiday_recent, f.umuganda_recent,
         f.last_fill, f.avg_fill, f.fill_rate, f.expected_fill, f.history_n,
         (p.fill_level in ('full', 'overflow'))::int,
         p.client_id::text like '00000000-%'
  from public.pickups p
  cross join lateral public.demand_features((p.scanned_at at time zone 'Africa/Kigali')::date, p.household_id) f
  where p.valid
$$;
revoke execute on function public.demand_training_set() from public, anon, authenticated;
