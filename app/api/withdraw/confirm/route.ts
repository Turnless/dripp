import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import { WithdrawSchema, planWithdrawal } from "@/lib/withdraw-plan";
import { verifyUsdcTransfer } from "@/lib/wallet-server";

const ConfirmSchema = WithdrawSchema.extend({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * Step 2 of a withdrawal: verifies BOTH transfers (fee to treasury, payout
 * to destination) in the reported transaction before recording it.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { txHash, ...input } = parsed.data;
  const hash = txHash as `0x${string}`;

  const plan = planWithdrawal(input);
  if (!plan) {
    return NextResponse.json({ error: "Withdrawals aren't available yet" }, { status: 501 });
  }

  const [feeOk, payoutOk] = await Promise.all([
    plan.feeUnits > BigInt(0)
      ? verifyUsdcTransfer(hash, user.wallet_address, plan.treasury, plan.feeUnits).catch(() => false)
      : Promise.resolve(true),
    verifyUsdcTransfer(hash, user.wallet_address, plan.destination, plan.payoutUnits).catch(() => false),
  ]);
  if (!feeOk || !payoutOk) {
    return NextResponse.json({ error: "We couldn't confirm that withdrawal." }, { status: 422 });
  }

  const { error } = await supabaseServer().from("withdrawals").insert({
    user_id: user.id,
    amount: input.amountUsd,
    fee: plan.feeCents / 100,
    tx_hash: hash,
  });
  if (error && error.code !== "23505") {
    console.error("withdrawals insert failed", error);
    return NextResponse.json({ error: "Your withdrawal went through but we couldn't save it." }, { status: 500 });
  }
  return NextResponse.json({ status: "settled" });
}
