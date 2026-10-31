-- A stable helper cannot see a row inserted by the same statement, so INSERT ... RETURNING failed for owners.
-- Check ownership directly on the row.
drop policy "see households" on public.households;
create policy "see households" on public.households for select to authenticated
  using (
    owner_id = auth.uid()
    or public.can_see_household(id)
    or (public.is_recycler() and exists (
      select 1 from public.recyclable_listings l
      where l.household_id = households.id and (l.status = 'open' or l.booked_by = auth.uid())))
  );
