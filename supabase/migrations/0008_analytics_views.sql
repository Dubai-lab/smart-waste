-- Read-only analytics views. security_invoker = true → the caller's RLS applies.

create view public.v_daily_pickups with (security_invoker = true) as
  select (p.scanned_at at time zone 'Africa/Kigali')::date as day, h.zone_id,
         count(*)::int as scans,
         count(*) filter (where p.valid)::int as valid,
         count(*) filter (where not p.valid)::int as rejected,
         count(*) filter (where p.valid and p.sorted_ok)::int as sorted_ok,
         count(*) filter (where p.valid and p.fill_level in ('full', 'overflow'))::int as full_bins
  from public.pickups p join public.households h on h.id = p.household_id
  group by 1, 2;

create view public.v_pickups with (security_invoker = true) as
  select p.id, p.household_id, h.label as household, h.zone_id, p.crew_member_id, pr.full_name as crew_member,
         p.scanned_at, p.synced_at, p.distance_m, p.gps_accuracy_m, p.fill_level, p.sorted_ok, p.photo_path,
         p.valid, p.rejection_reason,
         st_y(p.location::extensions.geometry) as lat, st_x(p.location::extensions.geometry) as lng
  from public.pickups p
  join public.households h on h.id = p.household_id
  left join public.profiles pr on pr.id = p.crew_member_id;

-- Per-household service quality over the last 30 days (heatmap for officers)
create view public.v_service_quality with (security_invoker = true) as
  select h.id as household_id, h.label, h.zone_id, v.sector, v.cell, v.name as village,
         st_y(h.location::extensions.geometry) as lat, st_x(h.location::extensions.geometry) as lng,
         (select count(*) from public.pickups p where p.household_id = h.id and p.valid and p.scanned_at > now() - interval '30 days')::int as pickups_30d,
         (select count(*) from public.route_stops s join public.routes r on r.id = s.route_id
            where s.household_id = h.id and r.route_date > current_date - 30 and r.route_date < current_date
              and s.status in ('pending', 'missed'))::int as missed_30d,
         (select count(*) from public.complaints c where c.household_id = h.id and c.created_at > now() - interval '30 days')::int as complaints_30d
  from public.households h left join public.villages v on v.id = h.village_id
  where h.active;

create view public.v_complaints with (security_invoker = true) as
  select c.*, h.label as household, pr.full_name as reporter, pr.phone as reporter_phone,
         (c.status not in ('resolved', 'rejected') and c.due_at < now()) as overdue
  from public.complaints c
  left join public.households h on h.id = c.household_id
  left join public.profiles pr on pr.id = c.reporter_id;

-- Prediction vs reality: a prediction is checked against the crew-recorded fill level that day.
create view public.v_prediction_eval with (security_invoker = true) as
  select d.household_id, d.for_date, d.probability, d.needs_pickup as predicted, d.model_version,
         bool_or(p.fill_level in ('full', 'overflow')) as actual
  from public.demand_predictions d
  join public.pickups p on p.household_id = d.household_id and p.valid
       and (p.scanned_at at time zone 'Africa/Kigali')::date = d.for_date
  group by 1, 2, 3, 4, 5;

create view public.v_listings with (security_invoker = true) as
  select l.*, h.label as household, st_y(h.location::extensions.geometry) as lat, st_x(h.location::extensions.geometry) as lng,
         pr.full_name as recycler
  from public.recyclable_listings l
  join public.households h on h.id = l.household_id
  left join public.profiles pr on pr.id = l.booked_by;

create view public.v_revenue with (security_invoker = true) as
  select i.period, h.zone_id,
         count(*)::int as invoices,
         count(*) filter (where i.status = 'paid')::int as paid,
         sum(i.amount)::int as billed, sum(i.discount)::int as discounts,
         sum(i.amount_due) filter (where i.status = 'paid')::int as collected,
         sum(i.amount_due) filter (where i.status <> 'paid')::int as outstanding
  from public.invoices i join public.households h on h.id = i.household_id
  group by 1, 2;
