-- A bin with a working sensor reports itself full. People (app, USSD, SMS, web) can then only ask for an
-- extra pickup (special service). If the sensor goes quiet for 3 hours (flat battery, no WiFi) the
-- household can report a full bin again, so nobody is stuck. Staff can always file a report.

create or replace function public.has_live_sensor(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bin_sensors
    where household_id = hid and last_seen_at > now() - interval '3 hours'
  )
$$;
revoke all on function public.has_live_sensor(uuid) from public;
grant execute on function public.has_live_sensor(uuid) to authenticated, service_role;

create or replace function public.guard_sensor_bin_full() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'bin_full' and new.channel <> 'sensor' and not public.is_staff()
     and public.has_live_sensor(new.household_id) then
    raise exception 'This bin has a sensor that reports automatically when it is full. You can still request an extra pickup.'
      using errcode = 'P0001', hint = 'sensor_reports_full';
  end if;
  return new;
end $$;
revoke all on function public.guard_sensor_bin_full() from public;

drop trigger if exists guard_sensor_bin_full on public.bin_reports;
create trigger guard_sensor_bin_full before insert on public.bin_reports
  for each row execute function public.guard_sensor_bin_full();
