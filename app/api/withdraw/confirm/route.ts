import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase";
import { WithdrawSchema, isExternalDestination, planWithdrawal } from "@/lib/withdraw-plan";
import { findUsdcTransfers } from "@/lib/wallet-server";

const ConfirmSchema = WithdrawSchema.extend({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * Step 2 of a withdrawal: verifies BOTH transfers (fee to treasury, payout
 * to destination) in the reported transaction before recording it. Each
 * transfer can back only one record anywhere (see record_withdrawal in
 * supabase/functions.sql), so the same transaction can't also be counted as
 * a tip. Same response codes as /api/tip/confirm (202 = ask again).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "withdraw", user.id);
  if (limited) return limited;

  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { txHash, ...input } = parsed.data;
  const hash = txHash.toLowerCase() as `0x${string}`;

  const plan = planWithdrawal(input);
  if (!plan) {
    return NextResponse.json({ error: "Withdrawals aren't available yet" }, { status: 501 });
  }

  try {
    if (!(await isExternalDestination(plan.destination))) {
      return NextResponse.json({ error: "That withdrawal destination isn't supported" }, { status: 400 });
    }
  } catch (err) {
    console.error("withdrawal destination check failed", err);
    return NextResponse.json({ error: "We're still saving your withdrawal. It'll show up shortly." }, { status: 503 });
  }

  let fee, payout;
  try {
    [fee, payout] = await Promise.all([
      plan.feeUnits > BigInt(0)
        ? findUsdcTransfers(hash, user.wallet_address, plan.treasury, plan.feeUnits)
        : Promise.resolve(null),
      findUsdcTransfers(hash, user.wallet_address, plan.destination, plan.payoutUnits),
    ]);
  } catch (err) {
    console.error("withdrawal verification failed", err);
    return NextResponse.json({ error: "We're still saving your withdrawal. It'll show up shortly." }, { status: 503 });
  }

  if (payout.status === "pending" || fee?.status === "pending") {
    return NextResponse.json({ status: "checking" }, { status: 202 });
  }
  if (payout.status === "missing" || fee?.status === "missing") {
    return NextResponse.json({ error: "We couldn't confirm that withdrawal." }, { status: 422 });
  }

  const { data: outcome, error } = await supabaseServer().rpc("record_withdrawal", {
    p_user_id: user.id,
    p_amount: input.amountUsd,
    p_fee: plan.feeCents / 100,
    p_tx_hash: hash,
    p_fee_log_indexes: fee?.status === "found" ? fee.logIndexes : [],
    p_payout_log_indexes: payout.logIndexes,
  });
  if (error) {
    console.error("record_withdrawal failed", error);
    return NextResponse.json({ error: "Your withdrawal went through but we couldn't save it." }, { status: 500 });
  }
  if (outcome !== "recorded" && outcome !== "already_recorded") {
    return NextResponse.json({ error: "That withdrawal was already saved." }, { status: 409 });
  }
  return NextResponse.json({ status: "settled" });
}
