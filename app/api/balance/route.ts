import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { getUsdcBalanceUnits } from "@/lib/wallet-server";
import { unitsToCents } from "@/lib/chain";

/** The signed-in user's balance, in cents. Never returns the account address. */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  try {
    const units = await getUsdcBalanceUnits(getAddress(user.wallet_address));
    return NextResponse.json({ cents: unitsToCents(units) });
  } catch (err) {
    console.error("balance read failed", err);
    return NextResponse.json({ error: "We couldn't load your balance. Try again in a moment." }, { status: 503 });
  }
}
