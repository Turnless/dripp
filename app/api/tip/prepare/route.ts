import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { TipSchema, isPlanError, planTip } from "@/lib/tip-plan";

/**
 * Step 1 of sending a tip: returns the calls the user's smart wallet should
 * send (gas-sponsored, from the browser). Nothing is recorded here -- see
 * /api/tip/confirm. The sender comes only from the verified Privy token.
 */
export async function POST(req: NextRequest) {
  const sender = await getAuthenticatedUser(req);
  if (!sender) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const parsed = TipSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the username and amount and try again" }, { status: 400 });
  }

  const plan = await planTip(sender.id, parsed.data);
  if (isPlanError(plan)) return NextResponse.json({ error: plan.error }, { status: plan.status });

  return NextResponse.json({ kind: plan.kind, calls: plan.calls });
}
