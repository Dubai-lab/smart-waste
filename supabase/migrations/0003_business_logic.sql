-- Business logic that must behave identically for app, web and USSD.

alter table public.route_stops add column alerted_at timestamptz;

create table ops.secrets (key text primary key, value text not null);
revoke all on schema ops from public, anon, authenticated;

create or replace function public.kigali_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Kigali')::date $$;

create or replace function public.setting_num(k text, fallback numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = k), fallback)
$$;

-- ───────────── signup → profile ─────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, phone, email, role, lang)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'phone', new.phone), ''),
    new.email,
    -- self-signup may only choose household or recycler; staff roles are granted by an admin
    case when requested in ('household', 'recycler') then requested::public.user_role else 'household' end,
    coalesce(nullif(new.raw_user_meta_data ->> 'lang', ''), 'en')::public.lang
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_privileged_session() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')
$$;

create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.officer_sector is distinct from old.officer_sector)
     and not public.is_privileged_session() and not public.is_admin() then
    raise exception 'Only an administrator can change roles';
  end if;
  return new;
end $$;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ───────────── households ─────────────
create or replace function public.household_before_write() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' and not public.is_privileged_session() and not public.is_staff() then
    -- residents may edit label/address/size/phone/location, not billing or assignment
    if new.zone_id is distinct from old.zone_id or new.monthly_fee is distinct from old.monthly_fee
       or new.owner_id is distinct from old.owner_id or new.active is distinct from old.active
       or new.qr_version is distinct from old.qr_version then
      raise exception 'Only the company can change zone, fee, owner or status';
    end if;
  end if;
  if tg_op = 'INSERT' and not public.is_privileged_session() and not public.is_staff() then
    new.monthly_fee := public.setting_num('default_monthly_fee', 3000)::int;
    new.active := true;
  end if;
  -- auto-assign zone: polygon containing the house, else nearest depot within 10 km
  if new.zone_id is null or (tg_op = 'UPDATE' and new.location is distinct from old.location and not public.is_staff()) then
    select z.id into new.zone_id from public.zones z
    where z.boundary is not null and st_covers(z.boundary, new.location) limit 1;
    if new.zone_id is null then
      select z.id into new.zone_id from public.zones z
      where z.depot is not null and st_dwithin(z.depot, new.location, 10000)
      order by st_distance(z.depot, new.location) limit 1;
    end if;
  end if;
  return new;
end $$;
create trigger household_before_write before insert or update on public.households
  for each row execute function public.household_before_write();

create or replace function public.household_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.household_secrets (household_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger household_after_insert after insert on public.households
  for each row execute function public.household_after_insert();

-- QR payload: SW1.<household uuid>.<version>.<hmac16>
create or replace function public.household_qr_payload(hid uuid) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare h record;
begin
  if not (public.owns_household(hid) or public.is_staff()) then
    raise exception 'Not allowed';
  end if;
  select hh.id, hh.qr_version, s.qr_secret into h
  from public.households hh join public.household_secrets s on s.household_id = hh.id where hh.id = hid;
  if h.id is null then raise exception 'Household not found'; end if;
  return format('SW1.%s.%s.%s', h.id, h.qr_version,
    left(encode(hmac(h.id::text || ':' || h.qr_version, h.qr_secret, 'sha256'), 'hex'), 16));
end $$;

-- ───────────── points ─────────────
create or replace function public.award_points(hid uuid, rule text, ref uuid) returns int
language plpgsql security definer set search_path = public as $$
declare pts int;
begin
  select points into pts from public.point_rules where key = rule and active;
  if pts is null or pts = 0 then return 0; end if;
  insert into public.points_ledger (household_id, delta, reason, ref_id)
  values (hid, pts, rule, ref) on conflict do nothing;
  return pts;
end $$;
revoke execute on function public.award_points(uuid, text, uuid) from public, anon, authenticated;

create view public.household_points with (security_invoker = true) as
  select household_id, coalesce(sum(delta), 0)::int as balance,
         coalesce(sum(delta) filter (where delta > 0), 0)::int as earned
  from public.points_ledger group by household_id;

-- ───────────── notifications (+ Expo push via pg_net) ─────────────
create or replace function public.notify_user(uid uuid, t text, b text, d jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, data) select uid, t, b, d where uid is not null
$$;
revoke execute on function public.notify_user(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  select push_token into tok from public.profiles where id = new.user_id;
  if tok is not null and tok like 'ExponentPushToken%' then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object('to', tok, 'title', new.title, 'body', new.body, 'data', new.data, 'sound', 'default'),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    new.pushed := true;
  end if;
  return new;
end $$;
create trigger push_notification before insert on public.notifications
  for each row execute function public.push_notification();

-- ───────────── proof of service ─────────────
create or replace function public.record_pickup(
  p_client_id uuid,
  p_qr text,
  p_scanned_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy real,
  p_fill public.fill_level,
  p_sorted_ok boolean default null,
  p_photo_path text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  parts text[];
  hid uuid;
  h record;
  expected text;
  pt geography;
  dist real;
  radius real := public.setting_num('geofence_radius_m', 50);
  ok boolean := true;
  why text;
  stop_id uuid;
  existing record;
  new_id uuid;
begin
  if public.auth_role() is distinct from 'crew' and not public.is_staff() then
    raise exception 'Only collection crew can record pickups';
  end if;

  select id, valid, rejection_reason, household_id into existing from public.pickups where client_id = p_client_id;
  if existing.id is not null then   -- offline retry: same scan already stored
    return jsonb_build_object('pickup_id', existing.id, 'valid', existing.valid, 'reason', existing.rejection_reason, 'duplicate', true);
  end if;

  parts := string_to_array(coalesce(p_qr, ''), '.');
  if array_length(parts, 1) <> 4 or parts[1] <> 'SW1' then
    raise exception 'Not a household QR code';
  end if;
  begin hid := parts[2]::uuid; exception when others then raise exception 'Not a household QR code'; end;

  select hh.*, s.qr_secret into h from public.households hh
  join public.household_secrets s on s.household_id = hh.id where hh.id = hid;
  if h.id is null then raise exception 'Unknown household'; end if;

  expected := left(encode(hmac(h.id::text || ':' || h.qr_version, h.qr_secret, 'sha256'), 'hex'), 16);
  if parts[3] <> h.qr_version::text or parts[4] <> expected then
    ok := false; why := 'QR code is invalid or was replaced';
  elsif not h.active then
    ok := false; why := 'Household is inactive';
  elsif not public.is_staff() and not public.is_crew_for_household(hid) then
    ok := false; why := 'Household is not in your zone';
  elsif p_scanned_at > now() + interval '5 minutes' or p_scanned_at < now() - interval '72 hours' then
    ok := false; why := 'Scan time is outside the accepted window';
  end if;

  if p_lat is null or p_lng is null then
    if ok then ok := false; why := 'No GPS position'; end if;
  else
    pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    dist := st_distance(pt, h.location);
    if ok and dist > radius + least(coalesce(p_accuracy, 0), 30) then
      ok := false; why := format('Phone was %s m from the house (limit %s m)', round(dist), round(radius));
    end if;
  end if;

  select rs.id into stop_id from public.route_stops rs
  join public.routes r on r.id = rs.route_id
  where rs.household_id = hid
    and r.route_date = (p_scanned_at at time zone 'Africa/Kigali')::date
  limit 1;

  insert into public.pickups (client_id, household_id, route_stop_id, crew_member_id, scanned_at, location,
                              gps_accuracy_m, distance_m, fill_level, sorted_ok, photo_path, valid, rejection_reason)
  values (p_client_id, hid, stop_id, auth.uid(), p_scanned_at, pt, p_accuracy, dist, p_fill, p_sorted_ok,
          p_photo_path, ok, why)
  returning id into new_id;

  if ok then
    update public.route_stops set status = 'collected' where id = stop_id;
    update public.bin_reports set status = 'done' where household_id = hid and status in ('open', 'scheduled');
    if p_sorted_ok then perform public.award_points(hid, 'sorted_correctly', new_id); end if;
    perform public.notify_user(h.owner_id, 'Waste collected',
      format('Your waste was collected at %s. Proof: QR + GPS (%s m).',
             to_char(p_scanned_at at time zone 'Africa/Kigali', 'HH24:MI'), round(dist)),
      jsonb_build_object('type', 'pickup', 'pickup_id', new_id));
  end if;

  return jsonb_build_object('pickup_id', new_id, 'valid', ok, 'reason', why, 'distance_m', round(dist),
                            'household', h.label, 'duplicate', false);
end $$;
revoke execute on function public.record_pickup from public, anon;
grant execute on function public.record_pickup to authenticated;

-- ───────────── billing ─────────────
create or replace function public.generate_invoices(p_period text default to_char(public.kigali_today(), 'YYYY-MM'))
returns int
language plpgsql security definer set search_path = public as $$
declare
  h record;
  bal int;
  point_value numeric := public.setting_num('point_value_rwf', 5);
  max_pct numeric := public.setting_num('max_points_discount_pct', 50);
  use_pts int;
  inv_id uuid;
  n int := 0;
  due date := to_date(p_period || '-10', 'YYYY-MM-DD');
begin
  if not (public.is_privileged_session() or public.is_staff()) then raise exception 'Not allowed'; end if;
  for h in select * from public.households where active and monthly_fee > 0
           and not exists (select 1 from public.invoices i where i.household_id = households.id and i.period = p_period)
  loop
    select coalesce(sum(delta), 0) into bal from public.points_ledger where household_id = h.id;
    use_pts := greatest(0, least(bal, floor(h.monthly_fee * max_pct / 100 / point_value)::int));
    insert into public.invoices (household_id, period, amount, points_used, discount, amount_due, due_date)
    values (h.id, p_period, h.monthly_fee, use_pts, (use_pts * point_value)::int,
            h.monthly_fee - (use_pts * point_value)::int, due)
    returning id into inv_id;
    if use_pts > 0 then
      insert into public.points_ledger (household_id, delta, reason, ref_id) values (h.id, -use_pts, 'fee_discount', inv_id);
    end if;
    perform public.notify_user(h.owner_id, 'New monthly bill',
      format('%s bill: %s RWF (green points saved you %s RWF). Due %s.', p_period,
             h.monthly_fee - (use_pts * point_value)::int, (use_pts * point_value)::int, to_char(due, 'DD Mon')),
      jsonb_build_object('type', 'invoice', 'invoice_id', inv_id));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.payment_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv record; owner uuid;
begin
  if new.status = 'successful' and old.status is distinct from 'successful' then
    update public.invoices set status = 'paid', paid_at = coalesce(new.completed_at, now())
    where id = new.invoice_id returning * into inv;
    if new.receipt_no is null then
      update public.payments set receipt_no = 'RCPT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(left(new.id::text, 6))
      where id = new.id;
    end if;
    if inv.id is not null and coalesce(new.completed_at, now())::date <= inv.due_date then
      perform public.award_points(new.household_id, 'on_time_payment', inv.id);
    end if;
    select owner_id into owner from public.households where id = new.household_id;
    perform public.notify_user(owner, 'Payment received',
      format('We received %s RWF for %s. Thank you!', new.amount, inv.period),
      jsonb_build_object('type', 'payment', 'payment_id', new.id));
  elsif new.status = 'failed' and old.status is distinct from 'failed' then
    update public.invoices set status = 'unpaid' where id = new.invoice_id and status = 'pending';
  end if;
  return new;
end $$;
create trigger payment_after_update after update on public.payments
  for each row execute function public.payment_after_update();

create or replace function public.payment_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'successful' then
    -- e.g. cash recorded by staff
    update public.payments set status = 'pending' where id = new.id;
    update public.payments set status = 'successful', completed_at = coalesce(new.completed_at, now()) where id = new.id;
  else
    update public.invoices set status = 'pending' where id = new.invoice_id and status = 'unpaid';
  end if;
  return new;
end $$;
create trigger payment_after_insert after insert on public.payments
  for each row execute function public.payment_after_insert();

-- ───────────── complaints ─────────────
create or replace function public.complaint_before_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare hrs numeric;
begin
  if new.lat is not null and new.lng is not null then
    new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  end if;
  if new.household_id is not null then
    select v.sector into new.sector from public.households h
    left join public.villages v on v.id = h.village_id where h.id = new.household_id;
    if new.sector is null then
      select z.sector into new.sector from public.households h join public.zones z on z.id = h.zone_id where h.id = new.household_id;
    end if;
    if new.location is null then
      select location, st_y(location::geometry), st_x(location::geometry)
      into new.location, new.lat, new.lng from public.households where id = new.household_id;
    end if;
  end if;
  hrs := public.setting_num('complaint_sla_hours_' || new.category::text, public.setting_num('complaint_sla_hours', 48));
  new.due_at := now() + make_interval(hours => hrs::int);
  new.status := 'open';
  new.escalation_level := 0;
  -- link the most recent pickup as evidence for missed-pickup disputes
  if new.category = 'missed_pickup' and new.household_id is not null then
    select id into new.evidence_pickup_id from public.pickups
    where household_id = new.household_id and scanned_at > now() - interval '7 days'
    order by scanned_at desc limit 1;
  end if;
  return new;
end $$;
create trigger complaint_before_insert before insert on public.complaints
  for each row execute function public.complaint_before_insert();

create or replace function public.complaint_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare reporter_household uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.complaint_events (complaint_id, actor_id, event, note) values (new.id, new.reporter_id, 'created', new.category::text);
    perform public.notify_user(p.id, 'New complaint', left(new.description, 120),
                               jsonb_build_object('type', 'complaint', 'complaint_id', new.id))
    from public.profiles p where p.role = 'manager';
  elsif new.status is distinct from old.status then
    insert into public.complaint_events (complaint_id, actor_id, event, note)
    values (new.id, auth.uid(), new.status::text, new.resolution_note);
    perform public.notify_user(new.reporter_id, 'Complaint ' || replace(new.status::text, '_', ' '),
      coalesce(new.resolution_note, 'Your complaint status changed.'),
      jsonb_build_object('type', 'complaint', 'complaint_id', new.id));
    if new.status = 'resolved' and new.category = 'illegal_dumping' then
      select id into reporter_household from public.households where owner_id = new.reporter_id limit 1;
      if reporter_household is not null then perform public.award_points(reporter_household, 'report_dumping', new.id); end if;
    end if;
  end if;
  return null;
end $$;
create trigger complaint_after_write after insert or update on public.complaints
  for each row execute function public.complaint_after_write();

create or replace function public.complaint_before_update() returns trigger
language plpgsql as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then new.resolved_at := now(); end if;
  return new;
end $$;
create trigger complaint_before_update before update on public.complaints
  for each row execute function public.complaint_before_update();

create or replace function public.escalate_overdue_complaints() returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select * from public.complaints
           where status in ('open', 'in_progress', 'escalated') and due_at < now() for update skip locked
  loop
    update public.complaints
    set status = 'escalated', escalation_level = escalation_level + 1, escalated_at = now(),
        due_at = now() + make_interval(hours => public.setting_num('escalation_extra_hours', 24)::int)
    where id = c.id;
    insert into public.complaint_events (complaint_id, event, note)
    values (c.id, 'auto_escalated', format('Level %s: not resolved before deadline', c.escalation_level + 1));
    -- level 1+: sector officers; level 2+: also admins
    perform public.notify_user(p.id, 'Escalated complaint',
      format('%s complaint unresolved past deadline (level %s).', replace(c.category::text, '_', ' '), c.escalation_level + 1),
      jsonb_build_object('type', 'complaint', 'complaint_id', c.id))
    from public.profiles p
    where (p.role = 'officer' and (p.officer_sector is null or p.officer_sector = c.sector))
       or (p.role = 'admin' and c.escalation_level >= 1);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────────── live tracking + arrival alerts ─────────────
create or replace function public.truck_location_before_write() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  alert_m real := public.setting_num('arrival_alert_radius_m', 1200);
begin
  new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  new.updated_at := now();
  insert into public.truck_location_history (truck_id, location) values (new.truck_id, new.location);
  -- "truck arriving in ~10 minutes": first time the truck comes within the radius of a pending stop today
  for s in
    select rs.id, h.owner_id, h.label from public.route_stops rs
    join public.routes r on r.id = rs.route_id
    join public.households h on h.id = rs.household_id
    where r.truck_id = new.truck_id and r.route_date = public.kigali_today()
      and rs.status = 'pending' and rs.alerted_at is null
      and st_dwithin(h.location, new.location, alert_m)
  loop
    update public.route_stops set alerted_at = now() where id = s.id;
    perform public.notify_user(s.owner_id, 'Truck arriving soon',
      'The collection truck is about 10 minutes away. Please put your bin out.',
      jsonb_build_object('type', 'arrival', 'stop_id', s.id));
  end loop;
  return new;
end $$;
create trigger truck_location_before_write before insert or update on public.truck_locations
  for each row execute function public.truck_location_before_write();

-- ───────────── recyclables ─────────────
create or replace function public.listing_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if public.is_recycler() and not public.is_staff() then
    if old.status = 'open' and new.status = 'booked' then
      new.booked_by := auth.uid();
    elsif old.booked_by = auth.uid() and new.status in ('collected', 'open') then
      if new.status = 'open' then new.booked_by := null; new.pickup_at := null; end if;
    else
      raise exception 'Recyclers can only book open listings or update their own bookings';
    end if;
    if new.material <> old.material or new.est_kg <> old.est_kg or new.household_id <> old.household_id then
      raise exception 'Recyclers cannot edit listing details';
    end if;
  end if;
  if new.status is distinct from old.status then
    select owner_id into owner from public.households where id = new.household_id;
    if new.status = 'booked' then
      perform public.notify_user(owner, 'Recyclables booked',
        format('A recycler booked your %s (%s kg).', new.material, new.est_kg),
        jsonb_build_object('type', 'listing', 'listing_id', new.id));
    elsif new.status = 'collected' then
      perform public.award_points(new.household_id, 'recyclables_collected', new.id);
      perform public.notify_user(owner, 'Recyclables collected', 'Thank you for recycling! Points added.',
        jsonb_build_object('type', 'listing', 'listing_id', new.id));
    end if;
  end if;
  return new;
end $$;
create trigger listing_before_update before update on public.recyclable_listings
  for each row execute function public.listing_before_update();

-- ───────────── household home summary (app + USSD) ─────────────
create or replace function public.household_summary(hid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  h record; z record; nxt date; d date; stop record; inv record; pts int;
begin
  if not (public.owns_household(hid) or public.is_staff() or public.is_privileged_session()) then
    raise exception 'Not allowed';
  end if;
  select * into h from public.households where id = hid;
  select * into z from public.zones where id = h.zone_id;
  for i in 0..13 loop
    d := public.kigali_today() + i;
    if z.collection_weekdays is not null and extract(isodow from d)::smallint = any (z.collection_weekdays) then nxt := d; exit; end if;
  end loop;
  select rs.status, rs.eta, rs.seq, r.truck_id, r.status as route_status into stop
  from public.route_stops rs join public.routes r on r.id = rs.route_id
  where rs.household_id = hid and r.route_date = public.kigali_today() limit 1;
  select * into inv from public.invoices where household_id = hid and status in ('unpaid', 'pending')
  order by period desc limit 1;
  select coalesce(sum(delta), 0) into pts from public.points_ledger where household_id = hid;
  return jsonb_build_object(
    'household_id', h.id, 'label', h.label, 'zone', z.name,
    'next_collection', nxt,
    'today_stop', case when stop.status is null then null else jsonb_build_object(
        'status', stop.status, 'eta', stop.eta, 'seq', stop.seq, 'truck_id', stop.truck_id, 'route_status', stop.route_status) end,
    'open_report', exists (select 1 from public.bin_reports where household_id = hid and status in ('open', 'scheduled')),
    'unpaid_invoice', case when inv.id is null then null else jsonb_build_object(
        'id', inv.id, 'period', inv.period, 'amount_due', inv.amount_due, 'due_date', inv.due_date, 'status', inv.status) end,
    'points', pts,
    'point_value_rwf', public.setting_num('point_value_rwf', 5)
  );
end $$;

-- ───────────── realtime ─────────────
alter publication supabase_realtime add table
  public.truck_locations, public.notifications, public.complaints, public.pickups,
  public.route_stops, public.routes, public.bin_reports, public.recyclable_listings, public.payments, public.invoices;

-- ───────────── storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- files are stored as <auth uid>/<anything>; owners and staff/officers can read
create policy "upload own evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read evidence" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_staff() or public.is_officer() or public.is_recycler()));
create policy "update own evidence" on storage.objects for update to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- ───────────── seed configuration ─────────────
insert into public.settings (key, value, description) values
  ('default_monthly_fee', '3000', 'Monthly collection fee in RWF for new households'),
  ('geofence_radius_m', '50', 'Max distance (m) between phone and house for a valid pickup'),
  ('arrival_alert_radius_m', '1200', 'Distance at which "truck arriving" alerts are sent (~10 min)'),
  ('point_value_rwf', '5', 'RWF discount per green point'),
  ('max_points_discount_pct', '50', 'Max % of a monthly fee that points can cover'),
  ('complaint_sla_hours', '48', 'Default hours to resolve a complaint before escalation'),
  ('complaint_sla_hours_missed_pickup', '24', 'Hours to resolve a missed pickup'),
  ('complaint_sla_hours_illegal_dumping', '72', 'Hours to clear illegal dumping'),
  ('escalation_extra_hours', '24', 'Extra hours given after each escalation'),
  ('prediction_threshold', '0.5', 'Probability above which a household is added to the route'),
  ('company_name', '"Smart Waste Pilot"', 'Name shown on receipts')
on conflict (key) do nothing;

insert into public.point_rules (key, points, description) values
  ('sorted_correctly', 10, 'Crew confirmed waste was sorted at pickup'),
  ('on_time_payment', 20, 'Monthly fee paid before the due date'),
  ('report_dumping', 15, 'Illegal dumping report verified and resolved'),
  ('recyclables_collected', 10, 'Recyclables listed and collected by a recycler'),
  ('ai_sorting_used', 1, 'Used the AI sorting assistant (max once a day)')
on conflict (key) do nothing;

insert into public.holidays (day, name) values
  ('2026-12-25', 'Christmas Day'), ('2026-12-26', 'Boxing Day'),
  ('2027-01-01', 'New Year''s Day'), ('2027-01-02', 'Day after New Year'),
  ('2027-02-01', 'National Heroes'' Day'), ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Easter Monday'), ('2027-04-07', 'Genocide against the Tutsi Memorial Day'),
  ('2027-05-01', 'Labour Day'), ('2027-07-01', 'Independence Day'),
  ('2027-07-04', 'Liberation Day'), ('2027-08-06', 'Umuganura Day'),
  ('2027-08-15', 'Assumption Day')
on conflict (day) do nothing;

-- ───────────── scheduled jobs (pg_cron, UTC; Kigali = UTC+2) ─────────────
select cron.schedule('escalate-complaints', '*/15 * * * *', $$select public.escalate_overdue_complaints()$$);
select cron.schedule('monthly-invoices', '0 4 1 * *', $$select public.generate_invoices()$$);

-- Calls the API's daily planning job (predict demand + optimise routes) if the API is configured.
create or replace function ops.call_api_job(path text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare base text; secret text;
begin
  select value into base from ops.secrets where key = 'api_base_url';
  select value into secret from ops.secrets where key = 'cron_secret';
  if base is null or secret is null then return; end if;
  perform net.http_post(url := base || path, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 60000);
end $$;
select cron.schedule('daily-planning', '0 3 * * *', $$select ops.call_api_job('/jobs/daily-plan')$$);
select cron.schedule('api-keepalive', '*/10 * * * *', $$select ops.call_api_job('/health')$$);
