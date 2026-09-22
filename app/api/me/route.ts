import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedPrivyId, getAuthenticatedUser, privy } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import type { LinkedAccount } from "@privy-io/node";

type LinkedAccountGoogleOAuth = Extract<LinkedAccount, { type: "google_oauth" }>;
type LinkedAccountSmartWallet = Extract<LinkedAccount, { type: "smart_wallet" }>;
type LinkedAccountEthereumEmbeddedWallet = Extract<
  LinkedAccount,
  { type: "wallet"; connector_type: "embedded"; chain_type: "ethereum" }
>;

/**
 * Sign-up / account sync. The app calls this right after Privy login; it
 * creates the caller's `users` row (or refreshes it) so every other API route
 * can find them by `privy_id`. Idempotent -- safe to call on every load.
 *
 * Everything is read from Privy's server API for the verified user, never
 * from the request body, so a caller can't register someone else's wallet.
 *
 * Returns what the UI needs about the account -- never the wallet address.
 */
export async function POST(req: NextRequest) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const privyUser = await privy().users()._get(privyId);

  const accounts = privyUser.linked_accounts;
  const google = accounts.find(
    (a): a is LinkedAccountGoogleOAuth => a.type === "google_oauth"
  );

  // Prefer the smart wallet if Privy smart wallets are enabled (that's the
  // gas-sponsored account that should hold funds), else the embedded wallet.
  // NOTE: revisit when the sponsored-transfer work (part 2) lands -- the
  // address stored here must be the one transfers are sent from/to.
  const smartWallet = accounts.find(
    (a): a is LinkedAccountSmartWallet => a.type === "smart_wallet"
  );
  const embeddedWallet = accounts.find(
    (a): a is LinkedAccountEthereumEmbeddedWallet =>
      a.type === "wallet" &&
      "connector_type" in a &&
      a.connector_type === "embedded" &&
      a.chain_type === "ethereum"
  );
  const walletAddress = (smartWallet ?? embeddedWallet)?.address;

  if (!google) {
    return NextResponse.json({ error: "Sign in with Google to continue" }, { status: 400 });
  }
  if (!walletAddress) {
    // Privy creates the embedded wallet client-side just after login, so it
    // can briefly not exist yet. The client retries on 409.
    return NextResponse.json({ error: "Account still being set up" }, { status: 409 });
  }

  const db = supabaseServer();
  const { data: user, error } = await db
    .from("users")
    .upsert(
      {
        privy_id: privyId,
        google_id: google.subject,
        wallet_address: walletAddress.toLowerCase(),
      },
      { onConflict: "privy_id" }
    )
    .select("id, mode")
    .single();

  if (error || !user) {
    console.error("users upsert failed", error);
    return NextResponse.json({ error: "Could not set up your account" }, { status: 500 });
  }

  const { data: links } = await db
    .from("platform_links")
    .select("platform, platform_username")
    .eq("user_id", user.id);

  return NextResponse.json({ mode: user.mode ?? null, links: links ?? [] });
}

const PatchSchema = z.object({ mode: z.enum(["viewer", "creator"]) });

/** Saves the viewer/creator choice. It only tailors the UI -- see schema.sql. */
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose viewer or creator" }, { status: 400 });
  }

  const { error } = await supabaseServer()
    .from("users")
    .update({ mode: parsed.data.mode })
    .eq("id", user.id);
  if (error) {
    console.error("users mode update failed", error);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ mode: parsed.data.mode });
}
