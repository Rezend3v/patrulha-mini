-- Ranking nicks are public: block profanity/slurs and links. Terms live in a
-- table so moderators can add more without a deploy. Blocked nicks become 'agente'.
create table public.nick_blocklist (
  term       text primary key check (term = lower(term)),
  -- true: match only as a whole word (short terms that occur inside innocent words)
  whole_word boolean not null default false
);
alter table public.nick_blocklist enable row level security;  -- no policies: not readable by players
revoke all on public.nick_blocklist from anon, authenticated;

insert into public.nick_blocklist (term, whole_word) values
  ('porra',false),('caralh',false),('karalh',false),('buceta',false),('boceta',false),('xoxota',false),
  ('xereca',false),('piroca',false),('pica',true),('rola',true),('pau',true),('cu',true),('cuzao',false),
  ('foder',false),('foda',false),('fodid',false),('fudid',false),('fdp',true),('pqp',true),('vsf',true),
  ('vtnc',true),('tnc',true),('puta',true),('putinha',false),('prostitut',false),('vagabund',false),
  ('arrombad',false),('desgracad',false),('merda',false),('bosta',false),('cacete',false),('punheta',false),
  ('siririca',false),('broxa',false),('corno',false),('chifrud',false),('otario',false),('babaca',false),
  ('escroto',false),('viado',false),('veado',false),('bicha',true),('baitola',false),('boiola',false),
  ('sapatao',false),('traveco',false),('macaco',false),('macaca',false),('crioulo',false),('criolo',false),
  ('negrinho',false),('tiziu',false),('mongol',true),('retardad',false),('aleijad',false),('nazi',false),
  ('hitler',false),('estupr',false),('pedofil',false),('pedo',true),('nigger',false),('nigga',false),
  ('fuck',false),('shit',true),('bitch',false),('cunt',false),('dick',true),('pussy',false),('whore',false),
  ('faggot',false),('retard',false);

-- Lower-case, strip accents and undo common leetspeak.
create function public.nick_normal(n text) returns text
language sql immutable set search_path = '' as $$
  select translate(lower(n), 'áàâãäéèêëíìîïóòôõöúùûüç0134578@$!|', 'aaaaaeeeeiiiiooooouuuucoieastbasii');
$$;

-- Postgres regex word boundary is \y (\b is backspace).
create function public.nick_allowed(n text) returns boolean
language sql stable security definer set search_path = '' as $$
  with norm as (select public.nick_normal(n) as s)
  select not exists (
    select 1 from public.nick_blocklist b, norm
    where case when b.whole_word
      then (' ' || regexp_replace(norm.s, '[^a-z]+', ' ', 'g') || ' ') like '% ' || b.term || ' %'
      -- substring terms also match with separators removed ("p.o.r.r.a")
      else regexp_replace(norm.s, '[^a-z]', '', 'g') like '%' || b.term || '%'
    end
  ) and n !~* '(https?:|www\.|\.(com|net|org|br|gg|io|xyz)\y|discord|t\.me)';
$$;
revoke execute on function public.nick_allowed(text) from public, anon, authenticated;

create or replace function public.submit_run(nick text, score integer, km numeric, seconds integer, correct integer, wrong integer)
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
  if not public.nick_allowed(n) then n := 'agente'; end if;
  insert into public.runs (user_id, nick, score, km, seconds, correct, wrong)
    values (auth.uid(), n, score, round(km, 2), seconds, correct, wrong);
end $$;
