-- Log an on-device classification and award the daily "used the AI sorting assistant" point.
create or replace function public.log_sorting(p_label text, p_confidence real, p_ms int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; hid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.sorting_classifications (user_id, predicted_label, confidence, inference_ms)
  values (auth.uid(), p_label, p_confidence, p_ms) returning id into cid;
  select id into hid from public.households where owner_id = auth.uid() and active limit 1;
  if hid is not null and not exists (
    select 1 from public.points_ledger where household_id = hid and reason = 'ai_sorting_used'
      and (created_at at time zone 'Africa/Kigali')::date = public.kigali_today()) then
    perform public.award_points(hid, 'ai_sorting_used', cid);
  end if;
  return cid;
end $$;
grant execute on function public.log_sorting(text, real, int) to authenticated;
