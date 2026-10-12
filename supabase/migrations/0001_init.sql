-- Patrulha Mini: runs, weekly leaderboard, paid situations, entitlements.
-- Enable "Anonymous sign-ins" in Auth settings for the client's signInAnonymously().

create table public.runs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nick        text not null check (char_length(nick) between 1 and 20),
  score       integer not null,
  km          numeric(8,2) not null check (km >= 0),
  seconds     integer not null check (seconds >= 0),
  correct     integer not null default 0,
  wrong       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index runs_week_idx on public.runs (created_at desc, score desc);

alter table public.runs enable row level security;
-- Reads go through the view; inserts only through the submit-run Edge Function (service role).
create policy "own runs readable" on public.runs for select using (auth.uid() = user_id);

-- Best run per user in the current ISO week (Brazil time). Runs as the view
-- owner, so it exposes only these columns, never user_id.
create view public.leaderboard_weekly as
select nick, score, km, seconds, correct, wrong
from (
  select distinct on (user_id) nick, score, km, seconds, correct, wrong
  from public.runs
  where created_at >= date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
  order by user_id, score desc
) best
order by score desc
limit 100;

grant select on public.leaderboard_weekly to anon, authenticated;

-- Paid content never ships in the client bundle.
create table public.situacoes_premium (
  id          text primary key,
  data        jsonb not null,          -- same shape as the client's Situacao
  ativo       boolean not null default true
);
alter table public.situacoes_premium enable row level security;  -- no policies: service role only

create table public.entitlements (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  plano       text not null default 'passe',
  pagamento_id text,
  created_at  timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy "own entitlement readable" on public.entitlements for select using (auth.uid() = user_id);
