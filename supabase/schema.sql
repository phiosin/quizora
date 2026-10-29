-- Quizora: paste this into Supabase → SQL Editor → New query → Run.
create table if not exists public.games (
  id            text primary key,
  created_at    timestamptz not null default now(),
  host_id       text not null,
  host_name     text not null,
  guest_id      text,
  guest_name    text,
  settings      jsonb not null,
  offered       jsonb not null,
  host_veto     text,
  guest_veto    text,
  rounds        jsonb,
  host_results  jsonb not null default '{}'::jsonb,
  guest_results jsonb not null default '{}'::jsonb
);

alter table public.games enable row level security;

-- MVP: no logins, anyone with the code can read/join/update a game.
drop policy if exists "games read" on public.games;
drop policy if exists "games insert" on public.games;
drop policy if exists "games update" on public.games;
create policy "games read"   on public.games for select using (true);
create policy "games insert" on public.games for insert with check (true);
create policy "games update" on public.games for update using (true);

-- Live updates when the opponent joins or finishes a round.
do $$ begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null; end $$;
