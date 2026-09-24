import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { supabaseServer } from "@/lib/supabase";
import { centsToUnits } from "@/lib/chain";
import { settleEscrowClaims } from "@/lib/escrow-claims";
import { anyRefundCandidates, recordRefunds } from "@/lib/escrow-refunds";
import {
  escrowDepositsBetween,
  escrowRefundsBetween,
  publicClient,
  usdcTransfersFrom,
} from "@/lib/wallet-server";

/**
 * Background recovery job. Tips are normally recorded by /api/tip/confirm,
 * but the browser can close (or lose its connection) after the money moved
 * and before confirm succeeds. This job finds those payments onchain and
 * records them against their tip intents, records escrow refunds whose
 * confirmation was missed, and finishes escrow claims whose result was never
 * applied. Safe to run as often as you like: recording is
 * idempotent (see record_tip in supabase/functions.sql).
 *
 * Call with `Authorization: Bearer $CRON_SECRET` -- what Vercel Cron sends --
 * e.g. every minute. It scans forward from where the last run stopped, at
 * most RECONCILE_MAX_BLOCKS blocks per run, RECONCILE_LOG_RANGE blocks per
 * log query (lower it if the RPC rejects the range).
 */
export const dynamic = "force-dynamic";

const CURSOR_KEY = "reconcile";
// Intents older than this are treated as abandoned (never sent).
const OPEN_INTENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Senders per log query (each becomes an OR'd topic filter).
const MAX_SENDERS = 100;

function envBlocks(name: string, fallback: number): bigint {
  const n = Number(process.env[name]);
  return BigInt(Number.isInteger(n) && n > 0 ? n : fallback);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  // Fail closed: without a real secret anyone could trigger the job.
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

type OpenIntent = {
  id: string;
  sender_id: string;
  sender_wallet: string;
  kind: "direct" | "escrow";
  recipient_wallet: string | null;
  handle_hash: string | null;
  amount: string | number;
};

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseServer();
  const logRange = envBlocks("RECONCILE_LOG_RANGE", 100);
  const maxBlocks = envBlocks("RECONCILE_MAX_BLOCKS", 2000);

  // 1. Escrow claims that were sent but whose result was never applied.
  let claimsUnsettled = false;
  try {
    claimsUnsettled = (await settleEscrowClaims()).unsettled;
  } catch (err) {
    console.error("reconcile: settling escrow claims failed", err);
  }

  // 2. Payments sent for tip intents that were never confirmed. The latest
  // block is read BEFORE the open intents: every payment in a scanned block
  // was sent after its intent was created, so its intent is in the list.
  const latest = await publicClient.getBlockNumber();
  const { data: cursor, error: cursorErr } = await db
    .from("sync_state")
    .select("block")
    .eq("key", CURSOR_KEY)
    .maybeSingle();
  if (cursorErr) {
    console.error("reconcile: cursor read failed", cursorErr);
    return NextResponse.json({ error: "cursor read failed" }, { status: 500 });
  }
  const zero = BigInt(0);
  const one = BigInt(1);
  const start = cursor ? BigInt(cursor.block) + one : latest - maxBlocks + one > zero ? latest - maxBlocks + one : zero;
  if (start > latest) {
    return NextResponse.json({ claimsUnsettled, scannedTo: Number(latest), recorded: 0 });
  }
  const end = start + maxBlocks - one < latest ? start + maxBlocks - one : latest;

  const { data: openRows, error: openErr } = await db
    .from("tip_intents")
    .select("id, sender_id, sender_wallet, kind, recipient_wallet, handle_hash, amount")
    .is("confirmed_at", null)
    .gte("created_at", new Date(Date.now() - OPEN_INTENT_MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(1000);
  if (openErr) {
    console.error("reconcile: open intents read failed", openErr);
    return NextResponse.json({ error: "intent read failed" }, { status: 500 });
  }
  const open = (openRows ?? []) as OpenIntent[];
  const done = new Set<string>();

  const senders = Array.from(new Set(open.filter((i) => i.kind === "direct").map((i) => getAddress(i.sender_wallet)))).slice(
    0,
    MAX_SENDERS
  );
  const hasEscrow = open.some((i) => i.kind === "escrow");
  // Refunds only exist for escrow at least 30 days old; skip the scan if none is.
  let scanRefunds = false;
  try {
    scanRefunds = await anyRefundCandidates();
  } catch (err) {
    console.error("reconcile: refund candidate check failed", err);
  }

  /** Records a refund log against the sender's account, if they're on dripp. */
  async function recordRefundLog(log: Awaited<ReturnType<typeof escrowRefundsBetween>>[number]) {
    const { handleHash, sender, amount } = log.args;
    if (!handleHash || !sender || amount === undefined) return;
    if (!log.transactionHash || log.logIndex === null || log.blockNumber === null) return;
    const { data: user, error } = await db
      .from("users")
      .select("id")
      .eq("wallet_address", sender.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    if (!user) return;
    await recordRefunds(user.id, log.transactionHash, [
      { handleHash, units: amount, logIndex: log.logIndex, blockNumber: log.blockNumber },
    ]);
  }
  const unitsOf = (i: OpenIntent) => centsToUnits(Math.round(Number(i.amount) * 100));
  const sameAddr = (a: string | null, b: string) => !!a && getAddress(a) === getAddress(b);

  /** Records `log` against the first open intent it matches. */
  async function recordLog(
    candidates: OpenIntent[],
    log: { transactionHash: `0x${string}` | null; logIndex: number | null; blockNumber: bigint | null }
  ): Promise<boolean> {
    if (!log.transactionHash || log.logIndex === null || log.blockNumber === null) return false;
    for (const intent of candidates) {
      if (done.has(intent.id)) continue;
      const { data: outcome, error } = await db.rpc("record_tip", {
        p_intent_id: intent.id,
        p_sender_id: intent.sender_id,
        p_tx_hash: log.transactionHash.toLowerCase(),
        p_log_indexes: [log.logIndex],
        p_block: Number(log.blockNumber),
      });
      if (error) throw error;
      if (outcome === "recorded") {
        done.add(intent.id);
        return true;
      }
      if (outcome === "log_used") return false; // this payment is already recorded
      done.add(intent.id); // intent recorded meanwhile (e.g. by confirm) -- try the next
    }
    return false;
  }

  let recorded = 0;
  let scannedTo = start - one;
  try {
    if (senders.length || hasEscrow || scanRefunds) {
      for (let from = start; from <= end; from += logRange) {
        const to = from + logRange - one < end ? from + logRange - one : end;
        const [transfers, deposits, refunds] = await Promise.all([
          senders.length ? usdcTransfersFrom(senders, from, to) : Promise.resolve([]),
          hasEscrow ? escrowDepositsBetween(from, to) : Promise.resolve([]),
          scanRefunds ? escrowRefundsBetween(from, to) : Promise.resolve([]),
        ]);
        for (const t of transfers) {
          const { from: sender, to: recipient, value } = t.args;
          if (!sender || !recipient || value === undefined) continue;
          const candidates = open.filter(
            (i) =>
              i.kind === "direct" &&
              sameAddr(i.sender_wallet, sender) &&
              sameAddr(i.recipient_wallet, recipient) &&
              unitsOf(i) === value
          );
          if (candidates.length && (await recordLog(candidates, t))) recorded++;
        }
        for (const d of deposits) {
          const { handleHash, sender, amount } = d.args;
          if (!handleHash || !sender || amount === undefined) continue;
          const candidates = open.filter(
            (i) =>
              i.kind === "escrow" &&
              sameAddr(i.sender_wallet, sender) &&
              i.handle_hash?.toLowerCase() === handleHash.toLowerCase() &&
              unitsOf(i) === amount
          );
          if (candidates.length && (await recordLog(candidates, d))) recorded++;
        }
        for (const r of refunds) await recordRefundLog(r);
        scannedTo = to;
      }
    } else {
      // Nothing open to match: skip ahead without querying logs.
      scannedTo = end;
    }
  } catch (err) {
    // Keep the progress made so far; the next run resumes from there.
    console.error("reconcile: log scan failed", err);
  }

  if (scannedTo >= start) {
    const { error } = await db
      .from("sync_state")
      .upsert({ key: CURSOR_KEY, block: Number(scannedTo), updated_at: new Date().toISOString() });
    if (error) console.error("reconcile: cursor save failed", error);
  }

  return NextResponse.json({ claimsUnsettled, scannedTo: Number(scannedTo), recorded });
}
