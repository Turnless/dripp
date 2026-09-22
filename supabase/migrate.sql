-- Brings an existing dripp database up to date with supabase/schema.sql.
-- Safe to run more than once: every step is skipped if already applied.
-- (A brand-new project can just run schema.sql instead.)

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
alter table pending_tips add column if not exists deposit_tx_hash text;
alter table pending_tips add column if not exists claimed_by uuid references users(id);
alter table pending_tips add column if not exists claim_tx_hash text;
alter table pending_tips add column if not exists claimed_at timestamptz;

create unique index if not exists pending_tips_deposit_tx_hash_key
  on pending_tips (deposit_tx_hash);
create index if not exists idx_pending_tips_sender on pending_tips (sender_id);

-- 4. withdrawals (amount + the 1% fee) -----------------------------------
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(12, 2) not null check (amount > 0),
  fee numeric(12, 2) not null check (fee >= 0),
  tx_hash text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists idx_withdrawals_user on withdrawals (user_id);

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

-- Note: privy_id and pending_tips.sender_id / deposit_tx_hash are NOT NULL in
-- schema.sql but stay nullable here, because rows created before this
-- migration have no value for them. New rows always set them.
