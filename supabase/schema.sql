-- Matches the ER diagram in 04-architecture.md, section 6.
-- Run this in the Supabase SQL editor (or via `supabase db push`) before
-- wiring up the app. RLS is enabled on every table with no policies (deny
-- all for the anon key) -- see the bottom of this file.

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
  created_at timestamptz not null default now()
);

create table platform_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'kick')),
  -- Always stored normalized (see normalizeHandle in lib/username-resolve.ts).
  platform_username text not null check (platform_username = lower(platform_username)),
  verified_at timestamptz not null default now(),
  unique (platform, platform_username)
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
  deposit_tx_hash text not null unique,
  claimed_by uuid references users(id),
  claim_tx_hash text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_pending_tips_sender on pending_tips (sender_id);

create index idx_pending_tips_lookup
  on pending_tips (platform, platform_username);

create table tips (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references users(id),
  recipient_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  tx_hash text not null unique,
  created_at timestamptz not null default now()
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
  tx_hash text not null unique,
  created_at timestamptz not null default now()
);

create index idx_withdrawals_user on withdrawals (user_id);

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
