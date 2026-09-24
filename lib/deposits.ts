import "server-only";
import { getAddress } from "viem";
import { supabaseServer } from "@/lib/supabase";
import { USDC_DECIMALS } from "@/lib/chain";

/**
 * "Added money": USDC someone sent to their dripp wallet from outside dripp
 * (the crypto option, lib/crypto-access.ts), found by the reconcile job.
 * Transfers from dripp itself are not deposits -- from another dripp wallet
 * they're tips, from TipVault they're escrow claims or refunds -- and those
 * are recorded elsewhere. Amounts under a cent (dust) are ignored.
 */

export type IncomingTransfer = {
  args: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  blockNumber: bigint | null;
};

const MIN_UNITS = BigInt(10) ** BigInt(USDC_DECIMALS - 2);

/**
 * Which transfers count as deposits, before the dripp-wallet check.
 * `owners` maps a lowercase wallet address to its user ID.
 */
export function depositCandidates(
  transfers: IncomingTransfer[],
  owners: Map<string, string>,
  vault: string | null
): Array<IncomingTransfer & { userId: string; from: `0x${string}`; value: bigint }> {
  const out = [];
  for (const t of transfers) {
    const { from, to, value } = t.args;
    if (!from || !to || value === undefined || value < MIN_UNITS) continue;
    if (!t.transactionHash || t.logIndex === null || t.blockNumber === null) continue;
    const userId = owners.get(to.toLowerCase());
    if (!userId) continue;
    if (vault && getAddress(from) === getAddress(vault)) continue;
    out.push({ ...t, userId, from, value });
  }
  return out;
}

/** Dollars with the full 6 decimals, as a string for numeric(18, 6). */
export function unitsToAmount(units: bigint): string {
  const base = BigInt(10) ** BigInt(USDC_DECIMALS);
  const frac = (units % base).toString().padStart(USDC_DECIMALS, "0");
  return `${units / base}.${frac}`;
}

/** Records the deposits among `transfers`; returns how many were new. */
export async function recordDeposits(
  transfers: IncomingTransfer[],
  owners: Map<string, string>,
  vault: string | null
): Promise<number> {
  const candidates = depositCandidates(transfers, owners, vault);
  if (!candidates.length) return 0;

  // Senders that are dripp wallets: those transfers are tips, not deposits.
  const db = supabaseServer();
  const senders = Array.from(new Set(candidates.map((c) => c.from.toLowerCase())));
  const { data: dripp, error } = await db.from("users").select("wallet_address").in("wallet_address", senders);
  if (error) throw error;
  const drippWallets = new Set((dripp ?? []).map((u) => u.wallet_address as string));

  let recorded = 0;
  for (const c of candidates) {
    if (drippWallets.has(c.from.toLowerCase())) continue;
    const { data: outcome, error: rpcErr } = await db.rpc("record_deposit", {
      p_user_id: c.userId,
      p_amount: unitsToAmount(c.value),
      p_from: c.from,
      p_tx_hash: c.transactionHash,
      p_log_index: c.logIndex,
      p_block: Number(c.blockNumber),
    });
    if (rpcErr) throw rpcErr;
    if (outcome === "recorded") recorded++;
  }
  return recorded;
}
