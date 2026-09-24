-- Brings an existing dripp database up to date with supabase/schema.sql.
-- Safe to run more than once: every step is skipped if already applied.
-- (A brand-new project can just run schema.sql instead.)
-- Run supabase/functions.sql after this.

-- 1. users: Privy ID + viewer/creator mode -------------------------------
alter table users add column if not exists privy_id text;
create unique index if not exists users_privy_id_key on users (privy_id);

alter table users add column if not exists mode text;
do $$ begin
  alter table users add constraint users_mode_check check (mode in ('viewer', 'creator'));
exception when duplicate_object then null; end $$;

-- 2. handles are always stored lowercase ---------------------------------
update platform_links set platform_username = lower(platform_username);
update pending_tips set platform_username = lower(platform_username);

do $$ begin
  alter table platform_links add constraint platform_links_username_lower
    check (platform_username = lower(platform_username));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table pending_tips add constraint pending_tips_username_lower
    check (platform_username = lower(platform_username));
exception when duplicate_object then null; end $$;

-- 3. pending_tips: who sent it, the deposit, and whether it was collected -
alter table pending_tips add column if not exists sender_id uuid references users(id);
alter table pending_tips add column if not exists sender_wallet text;
alter table pending_tips add column if not exists deposit_tx_hash text;
alter table pending_tips add column if not exists claimed_by uuid references users(id);
alter table pending_tips add column if not exists claim_tx_hash text;
alter table pending_tips add column if not exists claimed_at timestamptz;

create index if not exists idx_pending_tips_sender on pending_tips (sender_id);

-- 4. withdrawals (amount + the 1% fee) -----------------------------------
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  fee numeric(12, 2) not null check (fee >= 0),
  tx_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_withdrawals_user on withdrawals (user_id);

-- 4b. records are keyed by (transaction, log), not transaction alone ------
alter table tips add column if not exists log_index integer;
alter table tips drop constraint if exists tips_tx_hash_key;
drop index if exists tips_tx_hash_key;
create unique index if not exists tips_tx_hash_log_index_key on tips (tx_hash, log_index);

alter table pending_tips add column if not exists deposit_log_index integer;
alter table pending_tips add column if not exists deposit_block bigint;
alter table pending_tips drop constraint if exists pending_tips_deposit_tx_hash_key;
drop index if exists pending_tips_deposit_tx_hash_key;
create unique index if not exists pending_tips_deposit_tx_hash_deposit_log_index_key
  on pending_tips (deposit_tx_hash, deposit_log_index);

alter table withdrawals add column if not exists fee_log_index integer;
alter table withdrawals add column if not exists payout_log_index integer;
alter table withdrawals drop constraint if exists withdrawals_tx_hash_key;
drop index if exists withdrawals_tx_hash_key;
create unique index if not exists withdrawals_tx_hash_payout_log_index_key
  on withdrawals (tx_hash, payout_log_index);

-- 4c. tip intents, the log ledger, escrow claims, job progress ------------
create table if not exists tip_intents (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users(id),
  sender_wallet text not null,
  kind text not null check (kind in ('direct', 'escrow')),
  platform text not null check (platform in ('youtube', 'kick')),
  platform_username text not null check (platform_username = lower(platform_username)),
  recipient_id uuid references users(id),
  recipient_wallet text,
  handle_hash text,
  amount numeric(12, 2) not null check (amount > 0),
  tx_hash text,
  log_index integer,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (kind = 'direct' and recipient_id is not null and recipient_wallet is not null)
    or (kind = 'escrow' and handle_hash is not null)
  )
);
create index if not exists idx_tip_intents_sender on tip_intents (sender_id);
create index if not exists idx_tip_intents_open on tip_intents (created_at) where confirmed_at is null;

create table if not exists chain_logs (
  tx_hash text not null,
  log_index integer not null,
  kind text not null check (kind in ('tip', 'escrow_deposit', 'withdrawal_fee', 'withdrawal_payout')),
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

create table if not exists escrow_claims (
  tx_hash text primary key,
  platform text not null check (platform in ('youtube', 'kick')),
  platform_username text not null check (platform_username = lower(platform_username)),
  claimed_by uuid not null references users(id),
  succeeded boolean,
  claim_block bigint,
  claim_log_index integer,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_escrow_claims_handle on escrow_claims (platform, platform_username);

create table if not exists sync_state (
  key text primary key,
  block bigint not null,
  updated_at timestamptz not null default now()
);

-- 4d. handle lookup cache + rate limiting ---------------------------------
-- Cached YouTube/Kick handle lookups, so tipping someone who hasn't joined
-- doesn't spend platform API quota on every attempt -- and keeps working
-- (for handles seen before) if the quota runs out. See lib/username-resolve.ts.
create table if not exists handle_lookups (
  platform text not null check (platform in ('youtube', 'kick')),
  platform_username text not null check (platform_username = lower(platform_username)),
  found boolean not null,
  channel_id text,
  checked_at timestamptz not null default now(),
  primary key (platform, platform_username)
);

-- Per-user / per-IP request counters for API rate limiting (fixed window).
-- Written only through hit_rate_limit in functions.sql, which also prunes
-- old rows.
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- 4e. channel-ID identity, avatars, escrow keys, refunds -------------------
alter table platform_links add column if not exists channel_id text;
alter table platform_links add column if not exists avatar_url text;
create unique index if not exists platform_links_platform_channel_id_key
  on platform_links (platform, channel_id);

alter table pending_tips add column if not exists handle_hash text;
alter table pending_tips add column if not exists refunded_at timestamptz;
alter table pending_tips add column if not exists refund_tx_hash text;

alter table escrow_claims add column if not exists handle_hash text;
alter table escrow_claims add column if not exists legacy_handle boolean not null default false;

alter table chain_logs drop constraint if exists chain_logs_kind_check;
alter table chain_logs add constraint chain_logs_kind_check
  check (kind in ('tip', 'escrow_deposit', 'escrow_refund', 'withdrawal_fee', 'withdrawal_payout'));

-- 4b. what the public profile (/u/<handle>) shows ------------------------
alter table users add column if not exists show_received boolean not null default true;
alter table users add column if not exists show_sent boolean not null default true;
alter table users add column if not exists show_tip_counts boolean not null default true;
alter table users add column if not exists show_subscribers boolean not null default true;

-- Replaces the earlier single on/off switch: anyone who had turned it off
-- keeps their totals hidden.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'profile_public'
  ) then
    execute 'update users set show_received = false, show_sent = false, show_tip_counts = false
             where profile_public = false';
    execute 'alter table users drop column profile_public';
  end if;
end $$;

-- 4c. viewer verification ------------------------------------------------
alter table users add column if not exists human_verified_at timestamptz;
alter table users add column if not exists human_verified_via text;
do $$ begin
  alter table users add constraint users_human_verified_via_check
    check (human_verified_via in ('youtube', 'phone', 'topup'));
exception when duplicate_object then null; end $$;

alter table users add column if not exists phone_hash text;
create unique index if not exists users_phone_hash_key on users (phone_hash);

-- 4d. dripp usernames ------------------------------------------------------
alter table users add column if not exists username text;
alter table users add column if not exists username_changed_at timestamptz;
create unique index if not exists users_username_key on users (username);
do $$ begin
  alter table users add constraint users_username_check check (username ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;

create table if not exists username_holds (
  username text primary key,
  user_id uuid not null references users(id) on delete cascade,
  held_until timestamptz not null
);

alter table tip_intents drop constraint if exists tip_intents_platform_check;
alter table tip_intents add constraint tip_intents_platform_check
  check (platform in ('youtube', 'kick', 'dripp'));

-- 4e. crypto option + deposits -------------------------------------------
alter table users add column if not exists crypto_enabled boolean not null default false;
alter table users add column if not exists crypto_enabled_at timestamptz;

create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(18, 6) not null check (amount > 0),
  from_address text not null,
  tx_hash text not null,
  log_index integer not null,
  block bigint not null,
  created_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);
create index if not exists idx_deposits_user on deposits (user_id);

alter table chain_logs drop constraint if exists chain_logs_kind_check;
alter table chain_logs add constraint chain_logs_kind_check
  check (kind in ('tip', 'escrow_deposit', 'escrow_refund', 'withdrawal_fee', 'withdrawal_payout', 'deposit'));

-- 5. live tip alerts for the overlay -------------------------------------
do $$ begin
  alter publication supabase_realtime add table tips;
exception when duplicate_object then null; end $$;

-- 6. lock every table (the anon key is public; only the server may read) --
alter table users enable row level security;
alter table platform_links enable row level security;
alter table pending_tips enable row level security;
alter table tips enable row level security;
alter table withdrawals enable row level security;
alter table bot_scores enable row level security;
alter table tip_intents enable row level security;
alter table chain_logs enable row level security;
alter table escrow_claims enable row level security;
alter table sync_state enable row level security;
alter table handle_lookups enable row level security;
alter table rate_limits enable row level security;
alter table username_holds enable row level security;
alter table deposits enable row level security;

-- Note: some columns are NOT NULL in schema.sql but stay nullable here,
-- because rows created before this migration have no value for them. New
-- rows always set them. What the app does with those older rows:
--   * users.privy_id: /api/me finds the row by google_id on the user's next
--     sign-in and fills privy_id in (it can't be backfilled from SQL).
--   * tips.log_index, pending_tips.deposit_log_index / deposit_block,
--     withdrawals.payout_log_index: older rows keep NULL. A transaction that
--     already has one of these rows is never recorded again (see
--     functions.sql).
--   * pending_tips.sender_id / sender_wallet / deposit_tx_hash: rows without
--     a deposit_tx_hash were never verified onchain, so a claim never marks
--     them collected.
