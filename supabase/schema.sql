-- Cybersol MVP schema — run in Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists players (
  wallet text primary key,
  created_at timestamptz not null default now(),
  wins int not null default 0,
  losses int not null default 0,
  tickets_total int not null default 0
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references players(wallet),
  seed text not null,
  mode text not null check (mode in ('free', 'p2e')),
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'invalid', 'abandoned')),
  inputs jsonb,
  winner text,
  turns int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists matches_wallet_created_idx on matches (wallet, created_at desc);
create index if not exists matches_status_idx on matches (status);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  wallet text not null references players(wallet),
  match_id uuid not null references matches(id),
  day_utc date not null,
  created_at timestamptz not null default now(),
  unique (wallet, match_id)
);

create unique index if not exists tickets_match_id_uidx on tickets (match_id);
create index if not exists tickets_wallet_day_idx on tickets (wallet, day_utc);
create index if not exists matches_wallet_active_p2e_idx
  on matches (wallet)
  where status = 'active' and mode = 'p2e';

-- One in-flight P2E match per wallet (run even if the non-unique index above already exists).
create unique index if not exists matches_one_active_p2e_wallet
  on matches (wallet)
  where status = 'active' and mode = 'p2e';

create index if not exists matches_wallet_p2e_finished_idx
  on matches (wallet, finished_at)
  where mode = 'p2e' and status in ('won', 'lost');

create table if not exists raffle_rounds (
  id uuid primary key default gen_random_uuid(),
  day_utc date not null unique,
  pool_sol numeric(18, 9) not null,
  winners_count int not null,
  winners jsonb not null default '[]'::jsonb,
  paid boolean not null default false,
  tx_sigs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Service role bypasses RLS. Do not expose an anon key in the browser.
alter table players enable row level security;
alter table matches enable row level security;
alter table tickets enable row level security;
alter table raffle_rounds enable row level security;

drop policy if exists "public read players" on players;
drop policy if exists "public read tickets" on tickets;
drop policy if exists "public read raffle" on raffle_rounds;

-- Atomic daily-cap ticket grant (advisory lock). Re-run this even if tables already exist.
create or replace function grant_raffle_ticket(p_wallet text, p_match_id uuid, p_max int)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (timezone('utc', now()))::date;
  v_row tickets;
  v_count int;
begin
  if p_max < 1 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_wallet), extract(epoch from v_day)::int);

  select * into v_row from tickets where match_id = p_match_id;
  if found then
    return v_row;
  end if;

  select count(*) into v_count from tickets where wallet = p_wallet and day_utc = v_day;
  if v_count >= p_max then
    return null;
  end if;

  insert into tickets (wallet, match_id, day_utc)
  values (p_wallet, p_match_id, v_day)
  returning * into v_row;

  update players
    set tickets_total = tickets_total + 1
    where wallet = p_wallet;

  return v_row;
end;
$$;

revoke all on function grant_raffle_ticket(text, uuid, int) from public;
revoke all on function grant_raffle_ticket(text, uuid, int) from anon;
revoke all on function grant_raffle_ticket(text, uuid, int) from authenticated;
grant execute on function grant_raffle_ticket(text, uuid, int) to service_role;

-- Newer Supabase projects do not always grant table access to service_role.
grant usage on schema public to service_role;
grant select, insert, update, delete on table players, matches, tickets, raffle_rounds to service_role;
