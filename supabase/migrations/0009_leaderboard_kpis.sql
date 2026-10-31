-- Village leaderboard: aggregated points only (no personal data), readable by every signed-in user.
create or replace function public.village_leaderboard(p_days int default 30)
returns table (village_id uuid, village text, cell text, sector text, households int, points int, points_per_household numeric, sorted_rate numeric)
language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.cell, v.sector,
         count(distinct h.id)::int,
         coalesce(sum(l.delta) filter (where l.delta > 0), 0)::int,
         round(coalesce(sum(l.delta) filter (where l.delta > 0), 0)::numeric / greatest(count(distinct h.id), 1), 1),
         round((select avg(case when p.sorted_ok then 1 else 0 end) from public.pickups p
                join public.households h2 on h2.id = p.household_id
                where h2.village_id = v.id and p.valid and p.sorted_ok is not null
                  and p.scanned_at > now() - make_interval(days => p_days))::numeric, 2)
  from public.villages v
  join public.households h on h.village_id = v.id and h.active
  left join public.points_ledger l on l.household_id = h.id and l.created_at > now() - make_interval(days => p_days)
  group by v.id
  order by 7 desc nulls last
$$;
grant execute on function public.village_leaderboard(int) to authenticated;

-- Complaint handling KPIs per sector (officers / staff)
create or replace function public.complaint_kpis(p_days int default 30)
returns table (sector text, total int, resolved int, resolved_on_time int, escalated int, open_now int, avg_resolution_hours numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(c.sector, 'Unknown'), count(*)::int,
         count(*) filter (where c.status = 'resolved')::int,
         count(*) filter (where c.status = 'resolved' and c.escalation_level = 0)::int,
         count(*) filter (where c.escalation_level > 0)::int,
         count(*) filter (where c.status in ('open', 'in_progress', 'escalated'))::int,
         round(avg(extract(epoch from (c.resolved_at - c.created_at)) / 3600) filter (where c.resolved_at is not null)::numeric, 1)
  from public.complaints c
  where c.created_at > now() - make_interval(days => p_days)
    and (public.is_staff() or public.is_officer())
  group by 1 order by 2 desc
$$;
grant execute on function public.complaint_kpis(int) to authenticated;
