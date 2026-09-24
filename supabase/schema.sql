-- Matches the ER diagram in 04-architecture.md, section 6.
-- Run this in the Supabase SQL editor (or via `supabase db push`) before
-- wiring up the app, then run supabase/functions.sql. RLS is enabled on
-- every table with no policies (deny all for the anon key) -- see the bottom
-- of this file.

create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  -- Privy user ID (did:privy:...) -- how API routes map a verified access
  -- token back to a user row.
  privy_id text unique not null,
  google_id text unique not null,
  wallet_address text unique not null,
  -- How the user said they'll mainly use dripp, picked right after sign-up.
  -- Only tailors the UI (e.g. creators see the Creator tab first); it is NOT
  -- a separate account type -- anyone can tip and be tipped, and Creator Mode
  -- features still require linking a platform. Null = not chosen yet.
  mode text check (mode in ('viewer', 'creator')),
  -- What /u/<handle> shows about this user, each chosen on Profile ("What
  -- people see"). All on by default as a transparency signal.
  show_received boolean not null default true,
  show_sent boolean not null default true,
  show_tip_counts boolean not null default true,
  show_subscribers boolean not null default true,
  created_at timestamptz not null default now()
);

create table platform_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'kick')),
  -- Always stored normalized (see normalizeHandle in lib/username-resolve.ts).
  -- The current handle, for display and lookup; it can change.
  platform_username text not null check (platform_username = lower(platform_username)),
  -- The platform's permanent channel ID -- the identity that tips and escrow
  -- follow, so a renamed or reassigned handle can't route money to the
  -- wrong person. Written only by link_platform_account (functions.sql).
  channel_id text,
  -- The channel's profile picture, used as the user's avatar.
  avatar_url text,
  verified_at timestamptz not null default now(),
  unique (platform, platform_username),
  unique (platform, channel_id)
);

-- Indexed lookup target for "does this platform username already exist on
-- our platform" -- the fast, indexed check described in 04-architecture.md.
create index idx_platform_links_lookup
  on platform_links (platform, platform_username);

-- A tip held in the TipVault escrow for a handle that hasn't joined yet.
-- Rows are only written after the deposit is verified onchain, and are never
-- deleted: claiming fills in the claimed_* columns instead, so both sides keep
-- the tip in their history.
create table pending_tips (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('youtube', 'kick')),
  platform_username text not null check (platform_username = lower(platform_username)),
  amount numeric(12, 2) not null check (amount > 0),
  sender_id uuid not null references users(id),
  sender_wallet text not null,
  -- TipVault escrow key the deposit was made under (lib/tipvault.ts).
  handle_hash text,
  deposit_tx_hash text not null,
  -- Position of the PendingTipDeposited log, so a claim can tell which
  -- deposits it released (see apply_escrow_claim in functions.sql).
  deposit_log_index integer not null,
  deposit_block bigint not null,
  claimed_by uuid references users(id),
  claim_tx_hash text,
  claimed_at timestamptz,
  -- Set when the sender took the money back (TipVault.refund, 30 days after
  -- their latest deposit if nobody claimed it).
  refunded_at timestamptz,
  refund_tx_hash text,
  created_at timestamptz not null default now(),
  unique (deposit_tx_hash, deposit_log_index)
);

create index idx_pending_tips_sender on pending_tips (sender_id);

create index idx_pending_tips_lookup
  on pending_tips (platform, platform_username);

create table tips (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users(id),
  recipient_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  tx_hash text not null,
  -- One transaction can carry several transfers (e.g. several people's
  -- operations bundled together), so a tip is identified by its log.
  log_index integer not null,
  created_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);

create index idx_tips_recipient on tips (recipient_id);
create index idx_tips_sender on tips (sender_id);

-- Money leaving dripp. The 1% fee goes to the treasury in the same onchain
-- operation as the payout; rows are written only after both transfers verify.
create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  fee numeric(12, 2) not null check (fee >= 0),
  tx_hash text not null,
  fee_log_index integer,
  payout_log_index integer not null,
  created_at timestamptz not null default now(),
  unique (tx_hash, payout_log_index)
);

create index idx_withdrawals_user on withdrawals (user_id);

-- A tip the server has worked out (recipient + amount) and handed to the
-- browser to send. /api/tip/confirm checks the transaction against THIS row
-- instead of resolving the recipient again, so a creator linking their
-- channel mid-send (or a platform lookup failing) can't lose the record.
create table tip_intents (
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

create index idx_tip_intents_sender on tip_intents (sender_id);
create index idx_tip_intents_open on tip_intents (created_at) where confirmed_at is null;

-- Every onchain log that backs a row in tips, pending_tips or withdrawals.
-- The primary key means one transfer can only ever be recorded once, in
-- one table.
create table chain_logs (
  tx_hash text not null,
  log_index integer not null,
  kind text not null check (kind in ('tip', 'escrow_deposit', 'escrow_refund', 'withdrawal_fee', 'withdrawal_payout')),
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

-- TipVault.claim transactions sent by the backend. Written as soon as the
-- transaction is sent, so if waiting for it (or the database update after
-- it) fails, the next link attempt or the reconcile job finishes the job.
create table escrow_claims (
  tx_hash text primary key,
  platform text not null check (platform in ('youtube', 'kick')),
  platform_username text not null check (platform_username = lower(platform_username)),
  claimed_by uuid not null references users(id),
  -- The escrow key claimed. legacy_handle marks a claim of the old
  -- handle-based key, which also releases deposits recorded before keys were
  -- stored (pending_tips.handle_hash NULL).
  handle_hash text,
  legacy_handle boolean not null default false,
  succeeded boolean,
  claim_block bigint,
  claim_log_index integer,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_escrow_claims_handle on escrow_claims (platform, platform_username);

-- Cached YouTube/Kick handle lookups, so tipping someone who hasn't joined
-- doesn't spend platform API quota on every attempt -- and keeps working
-- (for handles seen before) if the quota runs out. See lib/username-resolve.ts.
create table handle_lookups (
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
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- Progress markers for background jobs (e.g. the last block the reconcile
-- job has scanned).
create table sync_state (
  key text primary key,
  block bigint not null,
  updated_at timestamptz not null default now()
);

create table bot_scores (
  user_id uuid primary key references users(id) on delete cascade,
  score real not null default 1.0 check (score between 0 and 1),
  last_calculated_at timestamptz not null default now()
);

-- Enables Supabase Realtime subscriptions on new tips, used by
-- app/api/overlay/events/[username]/route.ts.
alter publication supabase_realtime add table tips;

-- Lock every table down. The anon key is public (NEXT_PUBLIC_*), so without
-- RLS anyone could read or write every row -- including wallet addresses and
-- pending_tips -- straight through Supabase's REST/Realtime APIs. With RLS on
-- and no policies, only the server's service-role key (which bypasses RLS)
-- can touch these tables. Add narrow policies later only if a table genuinely
-- needs direct browser access.
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
