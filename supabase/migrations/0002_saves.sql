-- Player progress (balance + cosmetics), one row per auth user. The balance is
-- client-computed and only buys cosmetics, so players may write their own row.
create table public.saves (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  saldo         integer not null default 0 check (saldo >= 0),
  owned         text[] not null default '{v:classica,f:operacional}',
  viatura       text not null default 'classica',
  farda         text not null default 'operacional',
  nick          text check (char_length(nick) <= 20),
  recovery_hash text,
  updated_at    timestamptz not null default now()
);
create unique index saves_recovery_idx on public.saves (recovery_hash) where recovery_hash is not null;

alter table public.saves enable row level security;
create policy "own save select" on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "own save insert" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own save update" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- recovery_hash is managed only by the functions below. Column revokes don't
-- override table grants, so grant column by column instead.
revoke all on public.saves from anon, authenticated;
grant select (user_id, saldo, owned, viatura, farda, nick, updated_at) on public.saves to authenticated;
grant insert (user_id, saldo, owned, viatura, farda, nick, updated_at) on public.saves to authenticated;
-- PostgREST upserts set every payload column on conflict; RLS still pins user_id to auth.uid().
grant update (user_id, saldo, owned, viatura, farda, nick, updated_at) on public.saves to authenticated;

-- Issues a fresh recovery code for the caller's save (shown once, stored hashed).
create function public.create_recovery_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(12);
  code text := '';
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.saves (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.saves set recovery_hash = encode(extensions.digest(code, 'sha256'), 'hex')
    where user_id = auth.uid();
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end $$;

-- Moves the save that owns `code` to the caller (e.g. a new device). Returns false if no match.
create function public.claim_save(code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  h text := encode(extensions.digest(upper(replace(replace(trim(code), '-', ''), ' ', '')), 'sha256'), 'hex');
  src uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select user_id into src from public.saves where recovery_hash = h;
  if src is null then return false; end if;
  if src = auth.uid() then return true; end if;
  delete from public.saves where user_id = auth.uid();
  update public.saves set user_id = auth.uid(), updated_at = now() where user_id = src;
  return true;
end $$;

revoke execute on function public.create_recovery_code() from public, anon;
revoke execute on function public.claim_save(text) from public, anon;
grant execute on function public.create_recovery_code() to authenticated;
grant execute on function public.claim_save(text) to authenticated;
