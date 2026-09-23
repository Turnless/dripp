import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import { TipSchema, isPlanError, planTip } from "@/lib/tip-plan";

/**
 * Step 1 of sending a tip: works out where the tip goes, saves that as a
 * tip intent, and returns the calls the user's smart wallet should send
 * (gas-sponsored, from the browser). No tip is recorded here -- see
 * /api/tip/confirm, which checks the transaction against the saved intent.
 * The sender comes only from the verified Privy token.
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

  const { data: intent, error } = await supabaseServer()
    .from("tip_intents")
    .insert({
      sender_id: sender.id,
      sender_wallet: sender.wallet_address.toLowerCase(),
      kind: plan.kind,
      platform: plan.platform,
      platform_username: plan.username,
      recipient_id: plan.kind === "direct" ? plan.recipientId : null,
      recipient_wallet: plan.kind === "direct" ? plan.recipientWallet.toLowerCase() : null,
      handle_hash: plan.kind === "escrow" ? plan.hash : null,
      amount: parsed.data.amountUsd,
    })
    .select("id")
    .single();
  if (error || !intent) {
    console.error("tip_intents insert failed", error);
    return NextResponse.json({ error: "We couldn't start that tip. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ intentId: intent.id, kind: plan.kind, calls: plan.calls });
}
