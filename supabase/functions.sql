-- Database functions the API calls (via supabase.rpc) to record money
-- movements. Run after schema.sql (new project) or migrate.sql (existing
-- project). Safe to run more than once.
--
-- Each function does its checks and writes in one transaction, so two
-- requests racing on the same transaction can't both record it. Only the
-- server's service-role key may call them -- see the grants at the bottom.

-- True if a row written before logs were tracked (log index NULL) already
-- uses this transaction. Such a transaction is never recorded again, since we
-- can't tell which of its logs the old row used.
create or replace function tx_has_legacy_record(p_tx_hash text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from tips where lower(tx_hash) = p_tx_hash and log_index is null)
      or exists (select 1 from pending_tips where lower(deposit_tx_hash) = p_tx_hash and deposit_log_index is null)
      or exists (select 1 from withdrawals where lower(tx_hash) = p_tx_hash and payout_log_index is null);
$$;

-- Records the tip described by a tip_intents row, backed by the first log in
-- p_log_indexes (logs of p_tx_hash that match the intent exactly, checked
-- onchain by the caller) that no other record uses yet.
-- Returns: recorded | already_recorded | no_intent | intent_used | log_used
create or replace function record_tip(
  p_intent_id uuid,
  p_sender_id uuid,
  p_tx_hash text,
  p_log_indexes integer[],
  p_block bigint
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_tx text := lower(p_tx_hash);
  v_intent tip_intents%rowtype;
  v_claim escrow_claims%rowtype;
  v_log integer;
  v_used integer;
  v_pending_id uuid;
begin
  select * into v_intent from tip_intents
    where id = p_intent_id and sender_id = p_sender_id
    for update;
  if not found then
    return 'no_intent';
  end if;

  if v_intent.confirmed_at is not null then
    if v_intent.tx_hash = v_tx then
      return 'already_recorded';
    end if;
    return 'intent_used';
  end if;

  if tx_has_legacy_record(v_tx) then
    return 'log_used';
  end if;

  foreach v_log in array coalesce(p_log_indexes, '{}'::integer[]) loop
    insert into chain_logs (tx_hash, log_index, kind)
      values (v_tx, v_log, case when v_intent.kind = 'direct' then 'tip' else 'escrow_deposit' end)
      on conflict do nothing;
    if found then
      v_used := v_log;
      exit;
    end if;
  end loop;
  if v_used is null then
    return 'log_used';
  end if;

  if v_intent.kind = 'direct' then
    insert into tips (sender_id, recipient_id, amount, tx_hash, log_index)
      values (v_intent.sender_id, v_intent.recipient_id, v_intent.amount, v_tx, v_used);
  else
    insert into pending_tips (
      platform, platform_username, amount, sender_id, sender_wallet,
      deposit_tx_hash, deposit_log_index, deposit_block
    )
    values (
      v_intent.platform, v_intent.platform_username, v_intent.amount, v_intent.sender_id,
      v_intent.sender_wallet, v_tx, v_used, p_block
    )
    returning id into v_pending_id;

    -- Recorded after a claim already released it (e.g. found later by the
    -- reconcile job): the first successful claim after this deposit took it.
    select * into v_claim from escrow_claims
      where platform = v_intent.platform
        and platform_username = v_intent.platform_username
        and succeeded
        and (claim_block, claim_log_index) > (p_block, v_used)
      order by claim_block, claim_log_index
      limit 1;
    if found then
      update pending_tips
        set claimed_by = v_claim.claimed_by,
            claim_tx_hash = v_claim.tx_hash,
            claimed_at = v_claim.applied_at
        where id = v_pending_id;
    end if;
  end if;

  update tip_intents
    set tx_hash = v_tx, log_index = v_used, confirmed_at = now()
    where id = v_intent.id;
  return 'recorded';
end;
$$;

-- Records a withdrawal: the payout log, plus the fee log when there is a fee.
-- Returns: recorded | already_recorded | log_used
create or replace function record_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_fee numeric,
  p_tx_hash text,
  p_fee_log_indexes integer[],
  p_payout_log_indexes integer[]
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_tx text := lower(p_tx_hash);
  v_log integer;
  v_fee integer;
  v_payout integer;
begin
  if exists (
    select 1 from withdrawals
      where tx_hash = v_tx and user_id = p_user_id and amount = p_amount and fee = p_fee
  ) then
    return 'already_recorded';
  end if;

  if tx_has_legacy_record(v_tx) then
    return 'log_used';
  end if;

  foreach v_log in array coalesce(p_payout_log_indexes, '{}'::integer[]) loop
    insert into chain_logs (tx_hash, log_index, kind)
      values (v_tx, v_log, 'withdrawal_payout')
      on conflict do nothing;
    if found then
      v_payout := v_log;
      exit;
    end if;
  end loop;
  if v_payout is null then
    return 'log_used';
  end if;

  if cardinality(coalesce(p_fee_log_indexes, '{}'::integer[])) > 0 then
    foreach v_log in array p_fee_log_indexes loop
      insert into chain_logs (tx_hash, log_index, kind)
        values (v_tx, v_log, 'withdrawal_fee')
        on conflict do nothing;
      if found then
        v_fee := v_log;
        exit;
      end if;
    end loop;
    if v_fee is null then
      delete from chain_logs where tx_hash = v_tx and log_index = v_payout;
      return 'log_used';
    end if;
  end if;

  insert into withdrawals (user_id, amount, fee, tx_hash, fee_log_index, payout_log_index)
    values (p_user_id, p_amount, p_fee, v_tx, v_fee, v_payout);
  return 'recorded';
end;
$$;

-- Applies the result of a TipVault.claim transaction recorded in
-- escrow_claims. On success, marks the escrowed tips that claim released:
-- verified deposits for the handle that came before the claim onchain.
-- Deposits after it belong to the next round and stay waiting. Returns the
-- number of tips marked collected. Applying the same claim twice is a no-op.
create or replace function apply_escrow_claim(
  p_tx_hash text,
  p_succeeded boolean,
  p_block bigint,
  p_log_index integer
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_claim escrow_claims%rowtype;
  v_count integer := 0;
begin
  select * into v_claim from escrow_claims
    where tx_hash = lower(p_tx_hash)
    for update;
  if not found or v_claim.applied_at is not null then
    return 0;
  end if;

  update escrow_claims
    set succeeded = p_succeeded,
        claim_block = p_block,
        claim_log_index = p_log_index,
        applied_at = now()
    where tx_hash = v_claim.tx_hash;

  if p_succeeded then
    update pending_tips
      set claimed_by = v_claim.claimed_by,
          claim_tx_hash = v_claim.tx_hash,
          claimed_at = now()
      where platform = v_claim.platform
        and platform_username = v_claim.platform_username
        and claimed_at is null
        -- Rows without a deposit transaction were never verified onchain.
        and deposit_tx_hash is not null
        -- Rows from before logs were tracked (no block) predate every claim
        -- recorded here.
        and (
          deposit_block is null
          or (deposit_block, deposit_log_index) < (p_block, p_log_index)
        );
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;

-- Counts one request against each key (e.g. "tip:u:<user id>",
-- "tip:ip:<address>") in a fixed window of p_window_seconds, and returns
-- true if every key is still within its limit (p_limits[i] for p_keys[i] --
-- an IP is shared by everyone behind the same network, so it gets a looser
-- limit than a user). Keys over the limit still count, so hammering keeps
-- you limited. Old rows are pruned now and then.
create or replace function hit_rate_limit(
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_i integer;
  v_count integer;
  v_allowed boolean := true;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  for v_i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    insert into rate_limits as r (key, window_start, count)
      values (p_keys[v_i], now(), 1)
      on conflict (key) do update
        set window_start = case when r.window_start <= now() - v_window then now() else r.window_start end,
            count = case when r.window_start <= now() - v_window then 1 else r.count + 1 end
      returning r.count into v_count;
    if v_count > p_limits[v_i] then
      v_allowed := false;
    end if;
  end loop;

  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_allowed;
end;
$$;

-- Only the server (service-role key) may call these. Supabase grants new
-- functions to anon/authenticated by default, and the anon key is public.
revoke execute on function tx_has_legacy_record(text) from public, anon, authenticated;
revoke execute on function record_tip(uuid, uuid, text, integer[], bigint) from public, anon, authenticated;
revoke execute on function record_withdrawal(uuid, numeric, numeric, text, integer[], integer[]) from public, anon, authenticated;
revoke execute on function apply_escrow_claim(text, boolean, bigint, integer) from public, anon, authenticated;
revoke execute on function hit_rate_limit(text[], integer[], integer) from public, anon, authenticated;
grant execute on function tx_has_legacy_record(text) to service_role;
grant execute on function record_tip(uuid, uuid, text, integer[], bigint) to service_role;
grant execute on function record_withdrawal(uuid, numeric, numeric, text, integer[], integer[]) to service_role;
grant execute on function apply_escrow_claim(text, boolean, bigint, integer) to service_role;
grant execute on function hit_rate_limit(text[], integer[], integer) to service_role;
