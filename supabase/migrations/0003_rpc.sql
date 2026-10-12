-- Replaces the submit-run and situacoes Edge Functions with database functions.

-- Accepts a finished shift and rejects physically impossible numbers.
-- A sanity check, not real anti-cheat: a determined player can still forge plausible runs.
create function public.submit_run(nick text, score integer, km numeric, seconds integer, correct integer, wrong integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  max_kmh constant numeric := 130;          -- player top speed is well under this
  max_points_per_sec constant integer := 12;
  n text := coalesce(nullif(left(trim(nick), 20), ''), 'agente');
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if score is null or km is null or seconds is null or correct is null or wrong is null then raise exception 'invalid'; end if;
  if seconds <= 0 or seconds > 4 * 3600 then raise exception 'invalid duration'; end if;
  if km < 0 or km > max_kmh * seconds / 3600.0 * 3 then raise exception 'implausible distance'; end if;
  if score > seconds * max_points_per_sec then raise exception 'implausible score'; end if;
  if correct < 0 or wrong < 0 or (correct + wrong) * 4 > seconds then raise exception 'implausible answers'; end if;
  insert into public.runs (user_id, nick, score, km, seconds, correct, wrong)
    values (auth.uid(), n, score, round(km, 2), seconds, correct, wrong);
end $$;

-- Paid situations only for users with an entitlement.
create function public.premium_situacoes() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select p.data from public.situacoes_premium p
  where p.ativo and exists (select 1 from public.entitlements e where e.user_id = auth.uid());
$$;

revoke execute on function public.submit_run(text, integer, numeric, integer, integer, integer) from public, anon;
revoke execute on function public.premium_situacoes() from public, anon;
grant execute on function public.submit_run(text, integer, numeric, integer, integer, integer) to authenticated;
grant execute on function public.premium_situacoes() to authenticated;
