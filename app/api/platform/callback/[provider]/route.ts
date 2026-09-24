import { NextRequest, NextResponse } from "next/server";
import { LINK_NONCE_COOKIE, verifyState, type LinkReturnPath } from "@/lib/oauth";
import { supabaseServer } from "@/lib/supabase";
import { normalizeHandle } from "@/lib/username-resolve";
import { unitsToCents } from "@/lib/chain";
import { tipVaultAddress } from "@/lib/tipvault";
import { claimEscrowFor } from "@/lib/escrow-claims";

/**
 * Step 2 of platform linking: exchange the OAuth code for a token, fetch the
 * user's own channel identity (proving THEY own that channel, not just that
 * the handle exists -- the distinction that makes claiming safe), then:
 *   1. link the channel (by its permanent ID) to the user
 *   2. release any tips escrowed for that channel
 * and send the browser back to the page linking started from (Creator page
 * or Profile). This is the "claim on signup" flow from 04-architecture.md.
 *
 * *** VERIFY BEFORE USE ***
 * Token-exchange and "who am I" endpoint shapes for Kick need confirming
 * against current Kick API docs -- the YouTube side uses Google's stable,
 * well-documented OAuth token endpoint and the `channels.list?mine=true` call.
 */
/**
 * Why linking failed, sent back to the Creator page as `?link_error=` (which
 * turns it into a plain-English message) -- this route is opened by the
 * browser, so it never answers with raw JSON.
 */
type LinkError = "cancelled" | "expired" | "not_verified" | "no_channel" | "unavailable" | "failed";

function linkFailed(reason: LinkError, back: LinkReturnPath) {
  const res = NextResponse.redirect(`${process.env.APP_BASE_URL}${back}?link_error=${reason}`);
  res.cookies.delete({ name: LINK_NONCE_COOKIE, path: "/api/platform/callback" });
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // The nonce cookie proves this callback is finishing a flow that THIS
  // browser started -- see the comment at the top of lib/oauth.ts.
  const verified = state ? verifyState(state, req.cookies.get(LINK_NONCE_COOKIE)?.value) : null;
  const back = verified?.returnTo ?? "/profile";

  // The provider sends `error` (e.g. access_denied) when the user cancels.
  if (req.nextUrl.searchParams.get("error")) return linkFailed("cancelled", back);
  if (!code || !state) return linkFailed("failed", back);
  if (!verified) return linkFailed("expired", back);

  const redirectUri = `${process.env.APP_BASE_URL}/api/platform/callback/${params.provider}`;
  let platformUsername: string;
  let channelId: string;
  let avatarUrl: string | null;

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
      return linkFailed("not_verified", back);
    }

    const meRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
    );
    const meJson = await meRes.json();
    const channel = meJson.items?.[0];
    const handle = channel?.snippet?.customUrl as string | undefined;
    // The channel ID is the identity; the handle can change.
    if (!channel?.id || !handle) return linkFailed("no_channel", back);
    platformUsername = normalizeHandle(handle);
    channelId = channel.id as string;
    const thumbs = channel.snippet?.thumbnails;
    avatarUrl = (thumbs?.medium?.url ?? thumbs?.default?.url ?? null) as string | null;
  } else if (params.provider === "kick") {
    // TODO: implement Kick's token exchange + "me" endpoint the same way,
    // once confirmed against current Kick API docs.
    return linkFailed("unavailable", back);
  } else {
    return linkFailed("unavailable", back);
  }

  const db = supabaseServer();

  // OAuth just proved this user owns the channel, so they take it over even
  // if another account linked it earlier; any stale link still holding this
  // handle is removed (see link_platform_account in supabase/functions.sql).
  const { error: linkErr } = await db.rpc("link_platform_account", {
    p_user_id: verified.userId,
    p_platform: params.provider,
    p_channel_id: channelId,
    p_username: platformUsername,
    p_avatar_url: avatarUrl,
  });
  if (linkErr) {
    console.error("link_platform_account failed", linkErr);
    return linkFailed("failed", back);
  }

  // Release any tips held in escrow for this channel, now that OAuth proved
  // this user owns it. The onchain claim is the source of truth: rows are
  // marked collected (never deleted) from the claim's receipt, and only the
  // deposits that claim actually released -- see lib/escrow-claims.ts.
  let collectedCents = 0;
  const { data: user } = await db
    .from("users")
    .select("wallet_address")
    .eq("id", verified.userId)
    .single();
  if (user?.wallet_address && tipVaultAddress()) {
    try {
      const units = await claimEscrowFor(
        params.provider,
        platformUsername,
        channelId,
        verified.userId,
        user.wallet_address
      );
      collectedCents = unitsToCents(units);
    } catch (err) {
      // Linking still succeeded. Tips not yet claimed stay safely in escrow
      // and a claim already sent is finished by the next link attempt or the
      // reconcile job.
      console.error("escrow release failed", err);
    }
  }

  const res = NextResponse.redirect(
    `${process.env.APP_BASE_URL}${back}?linked=${params.provider}${collectedCents ? `&collected=${collectedCents}` : ""}`
  );
  res.cookies.delete({ name: LINK_NONCE_COOKIE, path: "/api/platform/callback" });
  return res;
}
