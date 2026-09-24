import "server-only";
import { getAddress } from "viem";
import { supabaseServer } from "./supabase";
import { handleHash } from "./tipvault";
import { readEscrowClaim, sendEscrowClaim, transactionKnown, type ClaimResult } from "./wallet-server";

/**
 * Releasing escrowed tips (TipVault.claim) and keeping pending_tips in step
 * with what the claim actually did onchain.
 *
 * Every claim transaction is written to escrow_claims the moment it's sent.
 * Rows are only marked collected once its receipt is read, using the claim's
 * position onchain (see apply_escrow_claim in supabase/functions.sql). If
 * waiting for the receipt or the database update fails, the claim stays
 * unapplied and is finished by the next link attempt for that handle or by
 * the reconcile job -- nothing is lost or marked collected early.
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

/**
 * Applies every sent-but-unapplied claim (for one handle, or all of them).
 * Returns whether any is still unconfirmed, and how much the claims applied
 * now released to `forUserId`.
 */
export async function settleEscrowClaims(
  handle?: { platform: Platform; username: string },
  forUserId?: string
): Promise<{ unsettled: boolean; unitsForUser: bigint }> {
  let query = supabaseServer()
    .from("escrow_claims")
    .select("tx_hash, platform, platform_username, claimed_by, created_at")
    .is("applied_at", null)
    .order("created_at", { ascending: true });
  if (handle) query = query.eq("platform", handle.platform).eq("platform_username", handle.username);
  const { data: rows, error } = await query;
  if (error) throw error;

  let unsettled = false;
  let unitsForUser = BigInt(0);
  for (const row of rows ?? []) {
    const txHash = row.tx_hash as `0x${string}`;
    let result = await readEscrowClaim(txHash, handleHash(row.platform, row.platform_username), 0);
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
 * Releases everything escrowed for a handle to `userId`'s wallet. Only call
 * after OAuth proved the user owns the handle. Returns the amount released
 * to them (0 if nothing was escrowed or the claim is still confirming).
 */
export async function claimEscrowFor(
  platform: Platform,
  username: string,
  userId: string,
  wallet: string
): Promise<bigint> {
  const earlier = await settleEscrowClaims({ platform, username }, userId);
  // A claim for this handle is still in flight: sending another would just
  // revert (or race it). It'll be applied by the next attempt or the job.
  if (earlier.unsettled) return earlier.unitsForUser;

  const hash = handleHash(platform, username);
  const txHash = await sendEscrowClaim(hash, getAddress(wallet));
  if (!txHash) return earlier.unitsForUser;

  const { error } = await supabaseServer().from("escrow_claims").insert({
    tx_hash: txHash.toLowerCase(),
    platform,
    platform_username: username,
    claimed_by: userId,
  });
  if (error) {
    // The claim was sent, but without this row the tips it released won't be
    // marked collected automatically. Loud, so it can be applied by hand.
    console.error("escrow_claims insert failed -- apply this claim by hand", { txHash, platform, username, error });
    return earlier.unitsForUser;
  }

  const result = await readEscrowClaim(txHash, hash);
  if (result.status === "pending") return earlier.unitsForUser;
  await applyClaim(txHash, result);
  return earlier.unitsForUser + (result.status === "claimed" ? result.units : BigInt(0));
}
