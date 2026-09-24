import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { WITHDRAW_BLOCK_ERRORS, userWithdrawToAddressBlock } from "@/lib/crypto-access";
import { rateLimit } from "@/lib/rate-limit";
import { WithdrawSchema, isExternalDestination, planWithdrawal } from "@/lib/withdraw-plan";
import { centsToUnits } from "@/lib/chain";
import { getUsdcBalanceUnits } from "@/lib/wallet-server";

/**
 * Step 1 of a withdrawal: returns the batched calls (1% fee to treasury +
 * payout) for the user's smart wallet to send. Nothing is recorded here.
 *
 * Until the offramp (Mercuryo) supplies the destination, the only caller is
 * "withdraw to a wallet address": for verified accounts with the crypto
 * option on (lib/crypto-access.ts). Confirm isn't gated: once money has
 * moved it must always be recordable.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "withdraw", user.id);
  if (limited) return limited;

  let block;
  try {
    block = await userWithdrawToAddressBlock(user.id);
  } catch (err) {
    console.error("withdraw access check failed", err);
    return NextResponse.json({ error: "We couldn't check your account. Please try again." }, { status: 500 });
  }
  if (block) {
    return NextResponse.json({ error: WITHDRAW_BLOCK_ERRORS[block] }, { status: 403 });
  }

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
