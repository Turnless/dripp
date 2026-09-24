import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { unitsToCents } from "@/lib/chain";
import { dueRefunds, refundCalls } from "@/lib/escrow-refunds";
import { tipVaultAddress } from "@/lib/tipvault";

/**
 * Tips the caller escrowed for someone who didn't join within 30 days, and
 * the calls that return them. The app sends these from the caller's smart
 * wallet automatically (lib/money-client.ts useAutoRefunds), then confirms
 * at /api/escrow/refunds/confirm.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "refunds", user.id);
  if (limited) return limited;
  if (!tipVaultAddress()) return NextResponse.json({ cents: 0, handles: [], calls: [] });

  try {
    const due = await dueRefunds(user.id, user.wallet_address);
    return NextResponse.json({
      cents: due.reduce((sum, d) => sum + unitsToCents(d.units), 0),
      handles: Array.from(new Set(due.map((d) => `@${d.handle}`))),
      calls: refundCalls(due.map((d) => d.key)),
    });
  } catch (err) {
    console.error("refund check failed", err);
    return NextResponse.json({ error: "Try again in a moment." }, { status: 503 });
  }
}
