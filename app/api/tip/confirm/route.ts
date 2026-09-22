import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import { TipSchema, isPlanError, planTip } from "@/lib/tip-plan";
import { verifyEscrowDeposit, verifyUsdcTransfer } from "@/lib/wallet-server";

const ConfirmSchema = TipSchema.extend({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * Step 2 of sending a tip: the browser reports the transaction its smart
 * wallet sent. We re-derive what that transaction MUST contain (same
 * planTip() as prepare) and check the onchain logs before writing history,
 * so a caller can't record a tip that didn't happen. tx hashes are unique in
 * the database, so the same transaction can't be counted twice.
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
  const { txHash, ...tip } = parsed.data;
  const hash = txHash as `0x${string}`;

  const plan = await planTip(sender.id, tip);
  if (isPlanError(plan)) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const db = supabaseServer();

  if (plan.kind === "direct") {
    const ok = await verifyUsdcTransfer(hash, sender.wallet_address, plan.recipientWallet, plan.units).catch(() => false);
    if (!ok) {
      return NextResponse.json({ error: "We couldn't confirm that payment. Please try again." }, { status: 422 });
    }
    const { error } = await db.from("tips").insert({
      sender_id: sender.id,
      recipient_id: plan.recipientId,
      amount: tip.amountUsd,
      tx_hash: hash,
    });
    if (error && error.code !== "23505") {
      console.error("tips insert failed", error);
      return NextResponse.json({ error: "Your tip was sent but we couldn't save it. Refresh in a moment." }, { status: 500 });
    }
    return NextResponse.json({ status: "settled" });
  }

  const ok = await verifyEscrowDeposit(hash, sender.wallet_address, plan.hash, plan.units).catch(() => false);
  if (!ok) {
    return NextResponse.json({ error: "We couldn't confirm that payment. Please try again." }, { status: 422 });
  }
  const { error } = await db.from("pending_tips").insert({
    platform: plan.platform,
    platform_username: plan.username,
    amount: tip.amountUsd,
    sender_id: sender.id,
    sender_wallet: sender.wallet_address,
    deposit_tx_hash: hash,
  });
  // 23505 = unique violation: this transaction was already recorded.
  if (error && error.code !== "23505") {
    console.error("pending_tips insert failed", error);
    return NextResponse.json({ error: "Your tip was sent but we couldn't save it. Refresh in a moment." }, { status: 500 });
  }
  return NextResponse.json({ status: "pending" });
}
