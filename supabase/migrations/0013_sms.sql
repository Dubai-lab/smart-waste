-- SMS through Infobip, sent from the database with pg_net (same pattern as Expo push).
-- Config lives in ops.secrets (no client can read it):
--   infobip_base_url  e.g. https://xxxxx.api.infobip.com
--   infobip_api_key
--   sms_allowlist     comma-separated numbers (2507xxxxxxxx) allowed to receive SMS, or '*' for everyone.
--                     The free trial only delivers to the verified number and has 15 messages, so keep it narrow.

create table ops.sms_log (
  id bigserial primary key,
  phone text not null,
  body text not null,
  request_id bigint,          -- net._http_response.id
  created_at timestamptz not null default now()
);

-- 0788123456 / 788123456 / +250788123456 → 250788123456
create or replace function public.normalize_rw_phone(p text) returns text
language sql immutable as $$
  select case
    when d ~ '^0\d{9}$' then '250' || substr(d, 2)
    when d ~ '^\d{9}$' then '250' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create or replace function public.send_sms(p_phone text, p_text text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_base text; v_key text; v_allow text; num text := public.normalize_rw_phone(p_phone); req bigint;
begin
  select value into v_base from ops.secrets where key = 'infobip_base_url';
  select value into v_key from ops.secrets where key = 'infobip_api_key';
  select value into v_allow from ops.secrets where key = 'sms_allowlist';
  if v_base is null or v_key is null or length(num) < 11 then return false; end if;
  if coalesce(v_allow, '') <> '*' and not (num = any (string_to_array(replace(coalesce(v_allow, ''), ' ', ''), ','))) then
    return false;
  end if;
  select net.http_post(
    url := rtrim(v_base, '/') || '/sms/2/text/advanced',
    body := jsonb_build_object('messages', jsonb_build_array(jsonb_build_object(
      'destinations', jsonb_build_array(jsonb_build_object('to', num)),
      'text', left(p_text, 300)))),
    headers := jsonb_build_object('Authorization', 'App ' || v_key, 'Content-Type', 'application/json',
                                  'Accept', 'application/json')
  ) into req;
  insert into ops.sms_log (phone, body, request_id) values (num, left(p_text, 300), req);
  return true;
end $$;
revoke execute on function public.send_sms(text, text) from public, anon, authenticated;
grant execute on function public.send_sms(text, text) to service_role;

-- Households without push (no app installed / basic phone) get the important alerts by SMS.
create or replace function public.sms_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  if new.pushed or coalesce(new.data ->> 'type', '') not in ('arrival', 'pickup', 'invoice', 'payment') then
    return null;
  end if;
  select coalesce(p.phone, (select h.phone from public.households h where h.owner_id = p.id and h.phone is not null limit 1))
    into ph from public.profiles p where p.id = new.user_id;
  if ph is not null then
    perform public.send_sms(ph, 'Smart Waste: ' || new.title || '. ' || new.body);
  end if;
  return null;
end $$;
create trigger sms_notification after insert on public.notifications
  for each row execute function public.sms_notification();
