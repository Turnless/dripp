import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { WithdrawSchema, isExternalDestination, planWithdrawal } from "@/lib/withdraw-plan";
import { centsToUnits } from "@/lib/chain";
import { getUsdcBalanceUnits } from "@/lib/wallet-server";

/**
 * Step 1 of a withdrawal: returns the batched calls (1% fee to treasury +
 * payout) for the user's smart wallet to send. Nothing is recorded here.
 *
 * TODO(Mercuryo offramp): not called by the UI yet -- the Withdraw sheet
 * stays disabled until the offramp integration can supply `destination`.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "withdraw", user.id);
  if (limited) return limited;

  const parsed = WithdrawSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const plan = planWithdrawal(parsed.data);
  if (!plan) {
    return NextResponse.json({ error: "Withdrawals aren't available yet" }, { status: 501 });
  }

  if (!(await isExternalDestination(plan.destination))) {
    return NextResponse.json({ error: "That withdrawal destination isn't supported" }, { status: 400 });
  }

  const balance = await getUsdcBalanceUnits(getAddress(user.wallet_address));
  if (balance < centsToUnits(plan.cents)) {
    return NextResponse.json({ error: "That's more than your balance" }, { status: 400 });
  }

  return NextResponse.json({ calls: plan.calls, feeCents: plan.feeCents });
}
