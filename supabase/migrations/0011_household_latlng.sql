-- lat/lng as stored generated columns so clients (and PostgREST embeds) can read coordinates directly.
alter table public.households
  add column lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored;

-- households_geo keeps working for existing callers
create or replace view public.households_geo with (security_invoker = true) as
  select h.* from public.households h;
