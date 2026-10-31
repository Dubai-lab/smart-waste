-- Row Level Security. Every table has RLS enabled and explicit policies.
-- The service_role key (API server, cron) bypasses RLS by design in Supabase.

-- QR secrets live apart from households so no client role can read them.
create table public.household_secrets (
  household_id uuid primary key references public.households (id) on delete cascade,
  qr_secret text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
insert into public.household_secrets (household_id, qr_secret) select id, qr_secret from public.households;
alter table public.households drop column qr_secret;

-- ───────────── helper functions (security definer: avoid recursive RLS) ─────────────
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('manager', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_officer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'officer' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_recycler() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'recycler' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.owns_household(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.households where id = hid and owner_id = auth.uid())
$$;

create or replace function public.my_crew_zone_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.zone_id from public.crews c
  join public.crew_members m on m.crew_id = c.id
  where m.profile_id = auth.uid() and c.zone_id is not null
$$;

create or replace function public.is_crew_for_household(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.households h
    where h.id = hid and h.zone_id in (select public.my_crew_zone_ids())
  )
$$;

create or replace function public.is_member_of_crew(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where crew_id = cid and profile_id = auth.uid())
$$;

create or replace function public.can_see_household(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or public.is_officer() or public.owns_household(hid) or public.is_crew_for_household(hid)
$$;

-- ───────────── enable RLS everywhere ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'villages','zones','settings','point_rules','holidays','profiles','households','household_secrets',
    'trucks','crews','crew_members','bin_reports','demand_predictions','routes','route_stops','pickups',
    'truck_locations','truck_location_history','invoices','payments','points_ledger','complaints',
    'complaint_events','recyclable_listings','notifications','sorting_classifications','ussd_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ───────────── reference tables: everyone signed in reads, staff writes ─────────────
create policy "read villages" on public.villages for select to authenticated using (true);
create policy "staff insert villages" on public.villages for insert to authenticated with check (public.is_staff());
create policy "staff update villages" on public.villages for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete villages" on public.villages for delete to authenticated using (public.is_staff());

create policy "read zones" on public.zones for select to authenticated using (true);
create policy "staff insert zones" on public.zones for insert to authenticated with check (public.is_staff());
create policy "staff update zones" on public.zones for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete zones" on public.zones for delete to authenticated using (public.is_staff());

create policy "read settings" on public.settings for select to authenticated using (true);
create policy "admin insert settings" on public.settings for insert to authenticated with check (public.is_admin());
create policy "admin update settings" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete settings" on public.settings for delete to authenticated using (public.is_admin());

create policy "read point rules" on public.point_rules for select to authenticated using (true);
create policy "admin insert point rules" on public.point_rules for insert to authenticated with check (public.is_admin());
create policy "admin update point rules" on public.point_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete point rules" on public.point_rules for delete to authenticated using (public.is_admin());

create policy "read holidays" on public.holidays for select to authenticated using (true);
create policy "staff insert holidays" on public.holidays for insert to authenticated with check (public.is_staff());
create policy "staff update holidays" on public.holidays for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete holidays" on public.holidays for delete to authenticated using (public.is_staff());

-- ───────────── profiles ─────────────
create policy "read own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff() or public.is_officer());
-- rows are created by the signup trigger; staff may create profiles for invited users
create policy "staff insert profiles" on public.profiles for insert to authenticated with check (public.is_staff());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());
create policy "admin delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

-- ───────────── households ─────────────
create policy "see households" on public.households for select to authenticated
  using (
    public.can_see_household(id)
    or (public.is_recycler() and exists (
      select 1 from public.recyclable_listings l
      where l.household_id = households.id and (l.status = 'open' or l.booked_by = auth.uid())))
  );
create policy "register own household" on public.households for insert to authenticated
  with check (owner_id = auth.uid() or public.is_staff());
create policy "update own household" on public.households for update to authenticated
  using (owner_id = auth.uid() or public.is_staff()) with check (owner_id = auth.uid() or public.is_staff());
create policy "staff delete households" on public.households for delete to authenticated using (public.is_staff());

-- secrets: staff read only (for printing QR); writes happen via triggers / service role
create policy "staff read secrets" on public.household_secrets for select to authenticated using (public.is_staff());
create policy "staff update secrets" on public.household_secrets for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ───────────── fleet ─────────────
create policy "read trucks" on public.trucks for select to authenticated using (true);
create policy "staff insert trucks" on public.trucks for insert to authenticated with check (public.is_staff());
create policy "staff update trucks" on public.trucks for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete trucks" on public.trucks for delete to authenticated using (public.is_staff());

create policy "read crews" on public.crews for select to authenticated using (true);
create policy "staff insert crews" on public.crews for insert to authenticated with check (public.is_staff());
create policy "staff update crews" on public.crews for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete crews" on public.crews for delete to authenticated using (public.is_staff());

create policy "read crew members" on public.crew_members for select to authenticated
  using (profile_id = auth.uid() or public.is_staff() or public.is_officer());
create policy "staff insert crew members" on public.crew_members for insert to authenticated with check (public.is_staff());
create policy "staff update crew members" on public.crew_members for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete crew members" on public.crew_members for delete to authenticated using (public.is_staff());

-- ───────────── demand ─────────────
create policy "see bin reports" on public.bin_reports for select to authenticated using (public.can_see_household(household_id));
create policy "report own bin" on public.bin_reports for insert to authenticated
  with check ((public.owns_household(household_id) and created_by = auth.uid()) or public.is_staff());
create policy "update bin reports" on public.bin_reports for update to authenticated
  using (public.is_staff() or public.is_crew_for_household(household_id) or public.owns_household(household_id))
  with check (public.is_staff() or public.is_crew_for_household(household_id) or public.owns_household(household_id));
create policy "staff delete bin reports" on public.bin_reports for delete to authenticated using (public.is_staff());

create policy "see predictions" on public.demand_predictions for select to authenticated
  using (public.is_staff() or public.is_officer() or public.is_crew_for_household(household_id));
create policy "staff insert predictions" on public.demand_predictions for insert to authenticated with check (public.is_staff());
create policy "staff update predictions" on public.demand_predictions for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete predictions" on public.demand_predictions for delete to authenticated using (public.is_staff());

-- ───────────── routes ─────────────
create policy "see routes" on public.routes for select to authenticated
  using (public.is_staff() or public.is_officer() or public.is_member_of_crew(crew_id));
create policy "staff insert routes" on public.routes for insert to authenticated with check (public.is_staff());
create policy "update routes" on public.routes for update to authenticated
  using (public.is_staff() or public.is_member_of_crew(crew_id)) with check (public.is_staff() or public.is_member_of_crew(crew_id));
create policy "staff delete routes" on public.routes for delete to authenticated using (public.is_staff());

create policy "see stops" on public.route_stops for select to authenticated
  using (public.is_staff() or public.is_officer() or public.owns_household(household_id)
         or exists (select 1 from public.routes r where r.id = route_id and public.is_member_of_crew(r.crew_id)));
create policy "staff insert stops" on public.route_stops for insert to authenticated with check (public.is_staff());
create policy "update stops" on public.route_stops for update to authenticated
  using (public.is_staff() or exists (select 1 from public.routes r where r.id = route_id and public.is_member_of_crew(r.crew_id)))
  with check (public.is_staff() or exists (select 1 from public.routes r where r.id = route_id and public.is_member_of_crew(r.crew_id)));
create policy "staff delete stops" on public.route_stops for delete to authenticated using (public.is_staff());

-- ───────────── pickups (inserted only through record_pickup()) ─────────────
create policy "see pickups" on public.pickups for select to authenticated using (public.can_see_household(household_id));
create policy "staff insert pickups" on public.pickups for insert to authenticated with check (public.is_staff());
create policy "staff update pickups" on public.pickups for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete pickups" on public.pickups for delete to authenticated using (public.is_staff());

-- ───────────── live tracking ─────────────
create policy "read truck locations" on public.truck_locations for select to authenticated using (true);
create policy "crew insert truck location" on public.truck_locations for insert to authenticated
  with check (exists (select 1 from public.crews c where c.truck_id = truck_locations.truck_id and public.is_member_of_crew(c.id)));
create policy "crew update truck location" on public.truck_locations for update to authenticated
  using (exists (select 1 from public.crews c where c.truck_id = truck_locations.truck_id and public.is_member_of_crew(c.id)))
  with check (exists (select 1 from public.crews c where c.truck_id = truck_locations.truck_id and public.is_member_of_crew(c.id)));
create policy "staff delete truck location" on public.truck_locations for delete to authenticated using (public.is_staff());

create policy "staff read location history" on public.truck_location_history for select to authenticated
  using (public.is_staff() or public.is_officer());
-- history rows are written by trigger (security definer)
create policy "staff delete location history" on public.truck_location_history for delete to authenticated using (public.is_staff());

-- ───────────── billing ─────────────
create policy "see invoices" on public.invoices for select to authenticated
  using (public.owns_household(household_id) or public.is_staff() or public.is_officer());
create policy "staff insert invoices" on public.invoices for insert to authenticated with check (public.is_staff());
create policy "staff update invoices" on public.invoices for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete invoices" on public.invoices for delete to authenticated using (public.is_staff());

create policy "see payments" on public.payments for select to authenticated
  using (public.owns_household(household_id) or public.is_staff());
-- mobile-money payments are created by the API (service role); staff may record cash
create policy "staff insert payments" on public.payments for insert to authenticated with check (public.is_staff());
create policy "staff update payments" on public.payments for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete payments" on public.payments for delete to authenticated using (public.is_admin());

create policy "see points" on public.points_ledger for select to authenticated
  using (public.owns_household(household_id) or public.is_staff() or public.is_officer());
create policy "staff adjust points" on public.points_ledger for insert to authenticated with check (public.is_staff());
create policy "admin update points" on public.points_ledger for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete points" on public.points_ledger for delete to authenticated using (public.is_admin());

-- ───────────── complaints ─────────────
create policy "see complaints" on public.complaints for select to authenticated
  using (reporter_id = auth.uid() or public.owns_household(household_id) or public.is_staff()
         or (public.is_officer() and (sector is null or sector = (select officer_sector from public.profiles where id = auth.uid())
                                      or (select officer_sector from public.profiles where id = auth.uid()) is null)));
create policy "file complaint" on public.complaints for insert to authenticated
  with check (reporter_id = auth.uid() and (household_id is null or public.owns_household(household_id) or public.is_staff()));
create policy "handle complaints" on public.complaints for update to authenticated
  using (public.is_staff() or public.is_officer()) with check (public.is_staff() or public.is_officer());
create policy "admin delete complaints" on public.complaints for delete to authenticated using (public.is_admin());

create policy "see complaint events" on public.complaint_events for select to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id));   -- inherits complaint visibility
create policy "add complaint events" on public.complaint_events for insert to authenticated
  with check (actor_id = auth.uid() and exists (select 1 from public.complaints c where c.id = complaint_id));
create policy "admin update complaint events" on public.complaint_events for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete complaint events" on public.complaint_events for delete to authenticated using (public.is_admin());

-- ───────────── recyclables ─────────────
create policy "see listings" on public.recyclable_listings for select to authenticated
  using (public.owns_household(household_id) or public.is_staff() or public.is_officer()
         or (public.is_recycler() and (status = 'open' or booked_by = auth.uid())));
create policy "create own listing" on public.recyclable_listings for insert to authenticated
  with check (public.owns_household(household_id) and status = 'open');
create policy "update listings" on public.recyclable_listings for update to authenticated
  using (public.owns_household(household_id) or public.is_staff()
         or (public.is_recycler() and (status = 'open' or booked_by = auth.uid())))
  with check (public.owns_household(household_id) or public.is_staff()
              or (public.is_recycler() and booked_by = auth.uid()));
create policy "delete own listing" on public.recyclable_listings for delete to authenticated
  using ((public.owns_household(household_id) and status = 'open') or public.is_staff());

-- ───────────── notifications & logs ─────────────
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "staff create notifications" on public.notifications for insert to authenticated with check (public.is_staff());
create policy "mark own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy "see classifications" on public.sorting_classifications for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "log own classification" on public.sorting_classifications for insert to authenticated with check (user_id = auth.uid());
create policy "feedback own classification" on public.sorting_classifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff delete classifications" on public.sorting_classifications for delete to authenticated using (public.is_staff());

-- ussd_sessions: intentionally no client policies — only the API (service role) touches it.
create policy "admin read ussd sessions" on public.ussd_sessions for select to authenticated using (public.is_admin());
