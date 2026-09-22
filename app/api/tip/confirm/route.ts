import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import { centsToUnits } from "@/lib/chain";
import { findEscrowDeposits, findUsdcTransfers, type LogMatch } from "@/lib/wallet-server";

const ConfirmSchema = z.object({
  intentId: z.string().uuid(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * Step 2 of sending a tip: the browser reports the transaction its smart
 * wallet sent for a tip intent (from /api/tip/prepare). We check the onchain
 * logs against what that intent says must have moved before recording
 * anything, so a caller can't record a tip that didn't happen.
 *
 * Responses the client relies on (lib/money-client.ts):
 *   200 -- recorded (or already recorded): { status: "settled" | "pending" }
 *   202 -- our node doesn't have the transaction yet; ask again
 *   422 -- the transaction is mined but the expected payment isn't in it, so
 *          nothing was sent for this tip and it's safe to try again
 *   404 / 409 -- unknown intent, or the intent / transfer is already recorded
 *          with a different transaction; asking again won't change that
 *   5xx -- temporary; ask again
 * Recording is idempotent, so the client can safely ask again after a
 * timeout or a lost response.
 */
export async function POST(req: NextRequest) {
  const sender = await getAuthenticatedUser(req);
  if (!sender) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const txHash = parsed.data.txHash.toLowerCase() as `0x${string}`;
  const db = supabaseServer();

  const { data: intent, error: intentErr } = await db
    .from("tip_intents")
    .select("id, kind, sender_wallet, recipient_wallet, handle_hash, amount, tx_hash, confirmed_at")
    .eq("id", parsed.data.intentId)
    .eq("sender_id", sender.id)
    .maybeSingle();
  if (intentErr) {
    console.error("tip_intents read failed", intentErr);
    return NextResponse.json({ error: "We're still saving your tip. It'll show up shortly." }, { status: 503 });
  }
  if (!intent) {
    return NextResponse.json({ error: "We couldn't find that tip." }, { status: 404 });
  }

  const recordedStatus = intent.kind === "direct" ? "settled" : "pending";
  if (intent.confirmed_at) {
    return intent.tx_hash === txHash
      ? NextResponse.json({ status: recordedStatus })
      : NextResponse.json({ error: "That tip was already saved." }, { status: 409 });
  }

  const units = centsToUnits(Math.round(Number(intent.amount) * 100));
  let match: LogMatch;
  try {
    match =
      intent.kind === "direct"
        ? await findUsdcTransfers(txHash, intent.sender_wallet, intent.recipient_wallet as string, units)
        : await findEscrowDeposits(txHash, intent.sender_wallet, intent.handle_hash as `0x${string}`, units);
  } catch (err) {
    console.error("tip verification failed", err);
    return NextResponse.json({ error: "We're still saving your tip. It'll show up shortly." }, { status: 503 });
  }

  if (match.status === "pending") {
    return NextResponse.json({ status: "checking" }, { status: 202 });
  }
  if (match.status === "missing") {
    return NextResponse.json(
      { error: "That payment didn't go through, so nothing was sent. Please try again." },
      { status: 422 }
    );
  }

  const { data: outcome, error } = await db.rpc("record_tip", {
    p_intent_id: intent.id,
    p_sender_id: sender.id,
    p_tx_hash: txHash,
    p_log_indexes: match.logIndexes,
    p_block: Number(match.blockNumber),
  });
  if (error) {
    console.error("record_tip failed", error);
    return NextResponse.json({ error: "We're still saving your tip. It'll show up shortly." }, { status: 503 });
  }

  switch (outcome as string) {
    case "recorded":
    case "already_recorded":
      return NextResponse.json({ status: recordedStatus });
    case "no_intent":
      return NextResponse.json({ error: "We couldn't find that tip." }, { status: 404 });
    default:
      // intent_used / log_used: this transfer or intent is already recorded.
      console.warn("record_tip refused", { intentId: intent.id, txHash, outcome });
      return NextResponse.json({ error: "That tip was already saved." }, { status: 409 });
  }
}
