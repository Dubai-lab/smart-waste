-- Smart Household Waste Collection — core schema
-- PostGIS lives in the "extensions" schema.

-- ───────────────────────── enums ─────────────────────────
create type public.user_role as enum ('household', 'crew', 'manager', 'officer', 'recycler', 'admin');
create type public.lang as enum ('en', 'rw', 'fr');
create type public.fill_level as enum ('empty', 'quarter', 'half', 'full', 'overflow');
create type public.report_type as enum ('bin_full', 'extra_pickup');
create type public.report_status as enum ('open', 'scheduled', 'done', 'cancelled');
create type public.channel as enum ('app', 'web', 'ussd', 'sms');
create type public.route_status as enum ('planned', 'approved', 'in_progress', 'completed');
create type public.stop_status as enum ('pending', 'collected', 'missed', 'skipped');
create type public.invoice_status as enum ('unpaid', 'pending', 'paid', 'waived');
create type public.payment_status as enum ('pending', 'successful', 'failed');
create type public.complaint_category as enum ('missed_pickup', 'illegal_dumping', 'crew_conduct', 'billing', 'other');
create type public.complaint_status as enum ('open', 'in_progress', 'escalated', 'resolved', 'rejected');
create type public.material as enum ('plastic', 'paper', 'cardboard', 'metal', 'glass', 'organic', 'e_waste', 'other');
create type public.listing_status as enum ('open', 'booked', 'collected', 'cancelled');

-- ───────────────────────── reference data ─────────────────────────
create table public.villages (           -- Umudugudu, with its Cell and Sector
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cell text not null,
  sector text not null,
  district text not null default 'Gasabo',
  unique (name, cell, sector)
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#0D9488',
  sector text,
  boundary extensions.geography(Polygon, 4326),
  depot extensions.geography(Point, 4326),        -- where trucks start/end
  collection_weekdays smallint[] not null default '{2,5}',  -- ISO weekday 1=Mon
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table public.point_rules (
  key text primary key,
  points int not null,
  description text not null,
  active boolean not null default true
);

create table public.holidays (
  day date primary key,
  name text not null
);

-- ───────────────────────── people ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text unique,
  email text,
  role public.user_role not null default 'household',
  lang public.lang not null default 'en',
  officer_sector text,          -- for officers: which sector they oversee
  push_token text,
  consent_at timestamptz,       -- privacy notice accepted (Law 058/2021)
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  zone_id uuid references public.zones (id) on delete set null,
  village_id uuid references public.villages (id) on delete set null,
  label text not null,                       -- e.g. "House 12, KG 9 Ave" / "Hostel B room 4"
  address text,
  location extensions.geography(Point, 4326) not null,
  size smallint not null default 4 check (size between 1 and 50),
  monthly_fee int not null default 3000 check (monthly_fee >= 0),
  qr_secret text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  qr_version int not null default 1,
  phone text,                                -- contact for USSD/SMS users without accounts
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.households using gist (location);
create index on public.households (zone_id);
create index on public.households (owner_id);

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  capacity_bins int not null default 80 check (capacity_bins > 0),
  fuel_l_per_100km numeric not null default 30,
  zone_id uuid references public.zones (id) on delete set null,
  active boolean not null default true
);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  zone_id uuid references public.zones (id) on delete set null,
  truck_id uuid references public.trucks (id) on delete set null,
  active boolean not null default true
);

create table public.crew_members (
  crew_id uuid references public.crews (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  primary key (crew_id, profile_id)
);

-- ───────────────────────── demand ─────────────────────────
create table public.bin_reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  type public.report_type not null default 'bin_full',
  status public.report_status not null default 'open',
  channel public.channel not null default 'app',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.bin_reports (household_id, created_at desc);

create table public.demand_predictions (
  household_id uuid references public.households (id) on delete cascade,
  for_date date not null,
  probability real not null check (probability between 0 and 1),
  needs_pickup boolean not null,
  model_version text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, for_date)
);

-- ───────────────────────── routes & proof of service ─────────────────────────
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  route_date date not null,
  zone_id uuid references public.zones (id) on delete set null,
  crew_id uuid references public.crews (id) on delete set null,
  truck_id uuid references public.trucks (id) on delete set null,
  status public.route_status not null default 'planned',
  distance_m int,
  duration_s int,
  baseline_distance_m int,          -- fixed-route distance for the same day (comparison)
  baseline_duration_s int,
  geometry jsonb,                   -- GeoJSON LineString of the road path
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (route_date, crew_id)
);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  seq int not null,
  reason text not null default 'predicted',   -- predicted | reported | scheduled | urgent
  probability real,
  eta timestamptz,
  status public.stop_status not null default 'pending',
  unique (route_id, household_id)
);
create index on public.route_stops (route_id, seq);

create table public.pickups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,                 -- generated on the phone; makes offline sync idempotent
  household_id uuid not null references public.households (id) on delete cascade,
  route_stop_id uuid references public.route_stops (id) on delete set null,
  crew_member_id uuid references public.profiles (id) on delete set null,
  scanned_at timestamptz not null,                -- device time of the scan
  synced_at timestamptz not null default now(),
  location extensions.geography(Point, 4326),
  gps_accuracy_m real,
  distance_m real,                                -- distance phone ↔ registered house
  fill_level public.fill_level not null,
  sorted_ok boolean,
  photo_path text,
  valid boolean not null,
  rejection_reason text
);
create index on public.pickups (household_id, scanned_at desc);

create table public.truck_locations (            -- latest position per truck (realtime)
  truck_id uuid primary key references public.trucks (id) on delete cascade,
  route_id uuid references public.routes (id) on delete set null,
  location extensions.geography(Point, 4326) not null,
  lat double precision not null,
  lng double precision not null,
  heading real,
  speed_mps real,
  reported_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.truck_location_history (
  id bigint generated always as identity primary key,
  truck_id uuid not null references public.trucks (id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  recorded_at timestamptz not null default now()
);

-- ───────────────────────── billing & points ─────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  amount int not null,
  points_used int not null default 0,
  discount int not null default 0,
  amount_due int not null,
  due_date date not null,
  status public.invoice_status not null default 'unpaid',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, period)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  amount int not null,
  provider text not null default 'mtn_momo',
  payer_phone text not null,
  external_ref text unique,                 -- MoMo X-Reference-Id
  status public.payment_status not null default 'pending',
  failure_reason text,
  receipt_no text unique,
  initiated_by uuid references public.profiles (id) on delete set null,
  channel public.channel not null default 'app',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  unique (household_id, reason, ref_id)
);

-- ───────────────────────── complaints ─────────────────────────
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete set null,
  reporter_id uuid references public.profiles (id) on delete set null,
  category public.complaint_category not null,
  description text not null check (length(description) between 3 and 2000),
  photo_path text,
  location extensions.geography(Point, 4326),
  lat double precision,
  lng double precision,
  sector text,
  channel public.channel not null default 'app',
  status public.complaint_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  due_at timestamptz not null default now() + interval '48 hours',
  escalation_level smallint not null default 0,
  escalated_at timestamptz,
  resolution_note text,
  evidence_pickup_id uuid references public.pickups (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.complaints (status, due_at);

create table public.complaint_events (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── recyclables marketplace ─────────────────────────
create table public.recyclable_listings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  material public.material not null,
  est_kg numeric not null check (est_kg > 0 and est_kg <= 1000),
  description text,
  photo_path text,
  asking_price_rwf int,
  status public.listing_status not null default 'open',
  booked_by uuid references public.profiles (id) on delete set null,
  pickup_at timestamptz,
  actual_kg numeric,
  created_at timestamptz not null default now()
);

-- ───────────────────────── notifications & AI logs ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  pushed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.sorting_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  predicted_label text not null,
  confidence real not null,
  inference_ms int,
  user_feedback text,           -- user-corrected label (for later retraining)
  created_at timestamptz not null default now()
);

create table public.ussd_sessions (
  session_id text primary key,
  phone text not null,
  last_input text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
