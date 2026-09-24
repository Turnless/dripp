import "server-only";
import { encodeFunctionData, getAddress } from "viem";
import { supabaseServer } from "./supabase";
import { handleHash, tipVaultAbi, tipVaultAddress } from "./tipvault";
import { refundableOf, type RefundLog } from "./wallet-server";

/**
 * Returning escrowed tips to their sender when the creator never joined.
 *
 * TipVault lets a sender take back their own contribution to a handle's
 * escrow 30 days after their latest deposit, if nobody claimed it. Only the
 * sender's own wallet can call refund(), so the app does it for them the next
 * time they open it (gas-free, no prompt) -- see useAutoRefunds in
 * lib/money-client.ts. The contract is the source of truth for what's
 * refundable; the database only records what happened.
 */

// The contract enforces the exact 30 days; this only skips rows that can't
// be due yet, so we don't ask the chain about every recent tip.
const REFUND_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

type PendingRow = {
  platform: "youtube" | "kick";
  platform_username: string;
  handle_hash: string | null;
};

// Deposits recorded before escrow keys were stored used the handle key.
const keyOf = (row: PendingRow) =>
  (row.handle_hash ?? handleHash(row.platform, row.platform_username)).toLowerCase() as `0x${string}`;

async function unresolvedRows(senderId: string, olderThanMs?: number): Promise<PendingRow[]> {
  let query = supabaseServer()
    .from("pending_tips")
    .select("platform, platform_username, handle_hash")
    .eq("sender_id", senderId)
    .is("claimed_at", null)
    .is("refunded_at", null)
    .not("deposit_tx_hash", "is", null);
  if (olderThanMs) query = query.lt("created_at", new Date(Date.now() - olderThanMs).toISOString());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PendingRow[];
}

export type DueRefund = { key: `0x${string}`; units: bigint; handle: string };

/** The escrow the sender can take back right now, per escrow key. */
export async function dueRefunds(senderId: string, wallet: string): Promise<DueRefund[]> {
  const rows = await unresolvedRows(senderId, REFUND_DELAY_MS);
  const byKey = new Map<`0x${string}`, PendingRow>();
  for (const row of rows) byKey.set(keyOf(row), row);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const due: DueRefund[] = [];
  for (const [key, row] of Array.from(byKey)) {
    const { units, availableAt } = await refundableOf(key, getAddress(wallet));
    if (units > BigInt(0) && availableAt <= now) due.push({ key, units, handle: row.platform_username });
  }
  return due;
}

/** One refund() call per escrow key, for the sender's smart wallet to send. */
export function refundCalls(keys: `0x${string}`[]) {
  const vault = tipVaultAddress();
  if (!vault) throw new Error("TipVault is not configured");
  return keys.map((key) => ({
    to: vault,
    data: encodeFunctionData({ abi: tipVaultAbi, functionName: "refund", args: [key] }),
  }));
}

/**
 * Records refunds from one sender (from their confirm call or the reconcile
 * job): marks their unclaimed deposits under each refunded key as returned.
 * Idempotent -- a refund already recorded is skipped.
 */
export async function recordRefunds(senderId: string, txHash: string, refunds: RefundLog[]): Promise<void> {
  // Deposits recorded before escrow keys were stored have no key on the row;
  // match them by the handle key they were made under.
  const legacy = new Map<string, PendingRow>();
  for (const row of await unresolvedRows(senderId)) {
    if (!row.handle_hash) legacy.set(keyOf(row), row);
  }

  for (const refund of refunds) {
    const legacyRow = legacy.get(refund.handleHash.toLowerCase());
    const { error } = await supabaseServer().rpc("record_refund", {
      p_sender_id: senderId,
      p_tx_hash: txHash.toLowerCase(),
      p_log_index: refund.logIndex,
      p_block: Number(refund.blockNumber),
      p_handle_hash: refund.handleHash.toLowerCase(),
      p_legacy_platform: legacyRow?.platform ?? null,
      p_legacy_username: legacyRow?.platform_username ?? null,
    });
    if (error) throw error;
  }
}

/** Does anyone have escrow that could be due? Lets the reconcile job skip scanning. */
export async function anyRefundCandidates(): Promise<boolean> {
  const { count, error } = await supabaseServer()
    .from("pending_tips")
    .select("id", { count: "exact", head: true })
    .is("claimed_at", null)
    .is("refunded_at", null)
    .not("deposit_tx_hash", "is", null)
    .lt("created_at", new Date(Date.now() - REFUND_DELAY_MS).toISOString());
  if (error) throw error;
  return (count ?? 0) > 0;
}
