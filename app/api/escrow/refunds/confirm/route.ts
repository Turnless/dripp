import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { unitsToCents } from "@/lib/chain";
import { recordRefunds } from "@/lib/escrow-refunds";
import { findRefunds } from "@/lib/wallet-server";

const ConfirmSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/**
 * Records the refunds in a transaction the caller's smart wallet sent. Only
 * PendingTipRefunded logs for the caller's own wallet count, so a caller
 * can't record anyone else's refund. Same response codes as
 * /api/tip/confirm: 202 = not visible yet, ask again; 422 = no refund in it.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "refunds", user.id);
  if (limited) return limited;

  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const txHash = parsed.data.txHash.toLowerCase() as `0x${string}`;

  try {
    const match = await findRefunds(txHash, user.wallet_address);
    if (match.status === "pending") return NextResponse.json({ status: "checking" }, { status: 202 });
    if (match.status === "missing") {
      return NextResponse.json({ error: "Nothing was returned in that transaction." }, { status: 422 });
    }
    await recordRefunds(user.id, txHash, match.refunds);
    return NextResponse.json({
      status: "refunded",
      cents: match.refunds.reduce((sum, r) => sum + unitsToCents(r.units), 0),
    });
  } catch (err) {
    console.error("refund confirm failed", err);
    return NextResponse.json({ error: "Try again in a moment." }, { status: 503 });
  }
}
