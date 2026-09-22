import { NextRequest, NextResponse } from "next/server";
import { LINK_NONCE_COOKIE, verifyState } from "@/lib/oauth";
import { supabaseServer } from "@/lib/supabase";
import { normalizeHandle } from "@/lib/username-resolve";
import { getAddress } from "viem";
import { unitsToCents } from "@/lib/chain";
import { handleHash, tipVaultAddress } from "@/lib/tipvault";
import { releaseEscrow } from "@/lib/wallet-server";

/**
 * Step 2 of platform linking: exchange the OAuth code for a token, fetch the
 * user's own channel identity (proving THEY own that handle, not just that
 * the handle exists -- the distinction that makes claiming safe), then:
 *   1. upsert a row in platform_links
 *   2. release any pending_tips that match this exact verified handle
 * This is the "claim on signup" flow from 04-architecture.md, step 5.
 *
 * *** VERIFY BEFORE USE ***
 * Token-exchange and "who am I" endpoint shapes for Kick need confirming
 * against current Kick API docs -- the YouTube side uses Google's stable,
 * well-documented OAuth token endpoint and the `channels.list?mine=true` call.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  // The nonce cookie proves this callback is finishing a flow that THIS
  // browser started -- see the comment at the top of lib/oauth.ts.
  const verified = verifyState(state, req.cookies.get(LINK_NONCE_COOKIE)?.value);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired state" }, { status: 400 });
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/platform/callback/${params.provider}`;
  let platformUsername: string;

  if (params.provider === "youtube") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      // Don't echo the provider's raw error body back to the browser.
      console.error("YouTube token exchange failed", tokenJson);
      return NextResponse.json(
        { error: "Could not verify your YouTube account" },
        { status: 400 }
      );
    }

    const meRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
    );
    const meJson = await meRes.json();
    const handle = meJson.items?.[0]?.snippet?.customUrl as string | undefined;
    if (!handle) {
      return NextResponse.json(
        { error: "Could not resolve YouTube handle for this account" },
        { status: 400 }
      );
    }
    platformUsername = normalizeHandle(handle);
  } else if (params.provider === "kick") {
    // TODO: implement Kick's token exchange + "me" endpoint the same way,
    // once confirmed against current Kick API docs.
    return NextResponse.json(
      { error: "Kick linking not yet implemented in this scaffold" },
      { status: 501 }
    );
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const db = supabaseServer();

  // OAuth just proved this user owns the handle, so they take it over even if
  // another account linked it earlier (conflict on the unique handle, not id).
  const { error: linkErr } = await db.from("platform_links").upsert(
    {
      user_id: verified.userId,
      platform: params.provider,
      platform_username: platformUsername,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "platform,platform_username" }
  );
  if (linkErr) {
    console.error("platform_links upsert failed", linkErr);
    return NextResponse.json({ error: "Could not link account" }, { status: 500 });
  }

  // Release any tips held in escrow for this handle, now that OAuth proved
  // this user owns it. The onchain balance is the source of truth; rows are
  // marked claimed (never deleted) only after the claim transaction succeeds.
  let collectedCents = 0;
  const { data: user } = await db
    .from("users")
    .select("wallet_address")
    .eq("id", verified.userId)
    .single();
  if (user?.wallet_address && tipVaultAddress()) {
    try {
      const released = await releaseEscrow(
        handleHash(params.provider, platformUsername),
        getAddress(user.wallet_address)
      );
      if (released) {
        collectedCents = unitsToCents(released.units);
        await db
          .from("pending_tips")
          .update({
            claimed_by: verified.userId,
            claim_tx_hash: released.txHash,
            claimed_at: new Date().toISOString(),
          })
          .eq("platform", params.provider)
          .eq("platform_username", platformUsername)
          .is("claimed_at", null);
      }
    } catch (err) {
      // Linking still succeeded; the tips stay safely in escrow and can be
      // released on the next link attempt.
      console.error("escrow release failed", err);
    }
  }

  const res = NextResponse.redirect(
    `${process.env.APP_BASE_URL}/creator?linked=${params.provider}${collectedCents ? `&collected=${collectedCents}` : ""}`
  );
  res.cookies.delete({ name: LINK_NONCE_COOKIE, path: "/api/platform/callback" });
  return res;
}
