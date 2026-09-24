import "server-only";
import { getAddress } from "viem";
import { supabaseServer } from "./supabase";
import { channelKey, handleHash } from "./tipvault";
import { readEscrowClaim, sendEscrowClaim, transactionKnown, type ClaimResult } from "./wallet-server";

/**
 * Releasing escrowed tips (TipVault.claim) and keeping pending_tips in step
 * with what the claim actually did onchain.
 *
 * Every claim transaction is written to escrow_claims the moment it's sent.
 * Rows are only marked collected once its receipt is read, using the claim's
 * position onchain (see apply_escrow_claim in supabase/functions.sql). If
 * waiting for the receipt or the database update fails, the claim stays
 * unapplied and is finished by the next link attempt for that channel or by
 * the reconcile job -- nothing is lost or marked collected early.
 *
 * A channel's escrow can sit under two keys: its channel key (every deposit
 * since channel IDs) and the older handle key (deposits before). Linking
 * claims both; see lib/tipvault.ts.
 */

type Platform = "youtube" | "kick";

// A claim our node has never heard of this long after sending was dropped.
const DROPPED_AFTER_MS = 10 * 60 * 1000;

async function applyClaim(txHash: string, result: Exclude<ClaimResult, { status: "pending" }>) {
  const claimed = result.status === "claimed";
  const { error } = await supabaseServer().rpc("apply_escrow_claim", {
    p_tx_hash: txHash,
    p_succeeded: claimed,
    p_block: claimed ? Number(result.blockNumber) : null,
    p_log_index: claimed ? result.logIndex : null,
  });
  if (error) throw error;
}

type ClaimRow = {
  tx_hash: string;
  platform: Platform;
  platform_username: string;
  handle_hash: string | null;
  claimed_by: string;
  created_at: string;
};

// Claims recorded before escrow keys were stored used the handle key.
const keyOf = (row: ClaimRow) =>
  (row.handle_hash ?? handleHash(row.platform, row.platform_username)) as `0x${string}`;

/**
 * Applies every sent-but-unapplied claim -- all of them, or only those for
 * the given escrow keys on a platform. Returns whether any is still
 * unconfirmed, and how much the claims applied now released to `forUserId`.
 */
export async function settleEscrowClaims(
  filter?: { platform: Platform; keys: `0x${string}`[] },
  forUserId?: string
): Promise<{ unsettled: boolean; unitsForUser: bigint }> {
  let query = supabaseServer()
    .from("escrow_claims")
    .select("tx_hash, platform, platform_username, handle_hash, claimed_by, created_at")
    .is("applied_at", null)
    .order("created_at", { ascending: true });
  if (filter) query = query.eq("platform", filter.platform);
  const { data, error } = await query;
  if (error) throw error;
  const wanted = filter ? new Set(filter.keys.map((k) => k.toLowerCase())) : null;
  const rows = ((data ?? []) as ClaimRow[]).filter((row) => !wanted || wanted.has(keyOf(row).toLowerCase()));

  let unsettled = false;
  let unitsForUser = BigInt(0);
  for (const row of rows) {
    const txHash = row.tx_hash as `0x${string}`;
    let result = await readEscrowClaim(txHash, keyOf(row), 0);
    if (result.status === "pending") {
      const old = Date.now() - Date.parse(row.created_at) > DROPPED_AFTER_MS;
      if (old && !(await transactionKnown(txHash))) {
        result = { status: "failed" };
      } else {
        unsettled = true;
        continue;
      }
    }
    await applyClaim(txHash, result);
    if (result.status === "claimed" && row.claimed_by === forUserId) unitsForUser += result.units;
  }
  return { unsettled, unitsForUser };
}

/**
 * Releases everything escrowed for a channel to `userId`'s wallet: under its
 * channel key, and under the handle key for deposits made before channel
 * keys. Only call after OAuth proved the user owns the channel and currently
 * holds the handle. Returns the amount released to them (0 if nothing was
 * escrowed or the claims are still confirming).
 */
export async function claimEscrowFor(
  platform: Platform,
  username: string,
  channelId: string,
  userId: string,
  wallet: string
): Promise<bigint> {
  const keys = [
    { hash: channelKey(platform, channelId), legacyHandle: false },
    { hash: handleHash(platform, username), legacyHandle: true },
  ];
  const earlier = await settleEscrowClaims({ platform, keys: keys.map((k) => k.hash) }, userId);
  // A claim for this channel is still in flight: sending another would just
  // revert (or race it). It'll be applied by the next attempt or the job.
  if (earlier.unsettled) return earlier.unitsForUser;

  let released = earlier.unitsForUser;
  for (const key of keys) {
    const txHash = await sendEscrowClaim(key.hash, getAddress(wallet));
    if (!txHash) continue;

    const { error } = await supabaseServer().from("escrow_claims").insert({
      tx_hash: txHash.toLowerCase(),
      platform,
      platform_username: username,
      handle_hash: key.hash,
      legacy_handle: key.legacyHandle,
      claimed_by: userId,
    });
    if (error) {
      // The claim was sent, but without this row the tips it released won't
      // be marked collected automatically. Loud, so it can be applied by hand.
      console.error("escrow_claims insert failed -- apply this claim by hand", { txHash, platform, username, error });
      continue;
    }

    const result = await readEscrowClaim(txHash, key.hash);
    if (result.status === "pending") continue;
    await applyClaim(txHash, result);
    if (result.status === "claimed") released += result.units;
  }
  return released;
}
