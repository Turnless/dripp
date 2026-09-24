import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedPrivyId, getAuthenticatedUser, privy } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";
import { mayWithdrawToAddress } from "@/lib/withdraw-access";
import { VisibilityPatchSchema, visibilityColumns, visibilityFromRow } from "@/lib/profile-visibility";
import { verificationFor, type Verification } from "@/lib/viewer-verification";
import { phoneVerifyConfigured } from "@/lib/phone-verify";
import { SET_USERNAME_ERRORS, USERNAME_CHANGE_DAYS, checkUsername, suggestUsername } from "@/lib/usernames";
import type { LinkedAccount } from "@privy-io/node";

type LinkedAccountGoogleOAuth = Extract<LinkedAccount, { type: "google_oauth" }>;
type LinkedAccountSmartWallet = Extract<LinkedAccount, { type: "smart_wallet" }>;

/**
 * Sign-up / account sync. The app calls this right after Privy login; it
 * creates the caller's `users` row (or refreshes it) so every other API route
 * can find them by `privy_id`. Idempotent -- safe to call on every load.
 *
 * Everything is read from Privy's server API for the verified user, never
 * from the request body, so a caller can't register someone else's wallet.
 *
 * Returns what the UI needs about the account -- never the wallet address.
 * The avatar comes from a linked channel's profile picture (Privy doesn't
 * provide the Google photo); the UI shows initials when there's none.
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

  // Only the smart wallet: it's the gas-sponsored account that sends tips
  // and holds the balance the app shows, so it's the address tips and escrow
  // claims are paid to. Never fall back to the embedded wallet (the smart
  // wallet's signer) -- money sent there wouldn't appear in the app.
  const walletAddress = accounts.find(
    (a): a is LinkedAccountSmartWallet => a.type === "smart_wallet"
  )?.address;

  if (!google) {
    return NextResponse.json({ error: "Sign in with Google to continue" }, { status: 400 });
  }
  if (!walletAddress) {
    // Privy creates the smart wallet client-side just after login, so it can
    // briefly not exist yet. The client retries on 409.
    return NextResponse.json({ error: "Account still being set up" }, { status: 409 });
  }

  const db = supabaseServer();
  const fields = {
    privy_id: privyId,
    google_id: google.subject,
    wallet_address: walletAddress.toLowerCase(),
  };

  // Accounts created before privy_id existed have it NULL (supabase/migrate.sql
  // can't backfill it). Adopt that row by google_id instead of inserting a
  // second one, which would collide on the unique google_id.
  const { data: legacy, error: legacyErr } = await db
    .from("users")
    .select("id")
    .eq("google_id", google.subject)
    .is("privy_id", null)
    .maybeSingle();
  if (legacyErr) {
    console.error("users legacy lookup failed", legacyErr);
    return NextResponse.json({ error: "Could not set up your account" }, { status: 500 });
  }

  // "*" rather than naming the show_* columns, so sign-in keeps working if
  // the app is deployed before supabase/migrate.sql adds them.
  const { data: user, error } = legacy
    ? await db.from("users").update(fields).eq("id", legacy.id).select("*").single()
    : await db.from("users").upsert(fields, { onConflict: "privy_id" }).select("*").single();

  if (error || !user) {
    console.error("users upsert failed", error);
    return NextResponse.json({ error: "Could not set up your account" }, { status: 500 });
  }

  let verification: Verification = { verified: false, via: null };
  try {
    verification = await verificationFor(user.id);
  } catch (err) {
    // Sign-in must not fail on this (e.g. before the migration has run).
    console.error("viewer verification read failed", err);
  }

  const { data: links } = await db
    .from("platform_links")
    .select("platform, platform_username, avatar_url, channel_id")
    .eq("user_id", user.id)
    .order("verified_at", { ascending: false });

  return NextResponse.json({
    mode: user.mode ?? null,
    // Links from before channel IDs were stored need linking again.
    links: (links ?? []).map(({ channel_id, ...l }) => ({ ...l, needs_relink: !channel_id })),
    avatarUrl: links?.find((l) => l.avatar_url)?.avatar_url ?? null,
    profileVisibility: visibilityFromRow(user),
    verification,
    username: (user.username as string | null) ?? null,
    // When they may change it next (null = now); the first choice is free.
    usernameChangeableAt:
      user.username && user.username_changed_at
        ? new Date(Date.parse(user.username_changed_at) + USERNAME_CHANGE_DAYS * 86400000).toISOString()
        : null,
    suggestedUsername: user.username ? null : suggestUsername(google.name),
    // Off until the Twilio settings are added; the app then hides the phone option.
    phoneVerifyAvailable: phoneVerifyConfigured(),
    canWithdrawToAddress: mayWithdrawToAddress(google.email),
  });
}

const PatchSchema = z.union([
  z.object({ mode: z.enum(["viewer", "creator"]) }),
  z.object({ profileVisibility: VisibilityPatchSchema }),
  z.object({ username: z.string().max(40) }),
]);

/**
 * Saves the viewer/creator choice, made once at sign-up. It only tailors the
 * UI (see schema.sql), and it can't be changed afterwards: only an account
 * without a mode yet can set one.
 *
 * Also sets what the public profile page (/u/<handle>) shows.
 */
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose viewer or creator" }, { status: 400 });
  }

  if ("username" in parsed.data) {
    const check = checkUsername(parsed.data.username);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    const { data: outcome, error } = await supabaseServer().rpc("set_username", {
      p_user: user.id,
      p_username: check.username,
    });
    if (error) {
      console.error("set_username failed", error);
      return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
    }
    if (outcome !== "ok") {
      const e = SET_USERNAME_ERRORS[outcome as string] ?? SET_USERNAME_ERRORS.invalid;
      return NextResponse.json({ error: e.error }, { status: e.status });
    }
    return NextResponse.json({
      username: check.username,
      usernameChangeableAt: new Date(Date.now() + USERNAME_CHANGE_DAYS * 86400000).toISOString(),
    });
  }

  if ("profileVisibility" in parsed.data) {
    const { data: row, error } = await supabaseServer()
      .from("users")
      .update(visibilityColumns(parsed.data.profileVisibility))
      .eq("id", user.id)
      .select("*")
      .single();
    if (error || !row) {
      console.error("users profile visibility update failed", error);
      return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ profileVisibility: visibilityFromRow(row) });
  }

  const { data: updated, error } = await supabaseServer()
    .from("users")
    .update({ mode: parsed.data.mode })
    .eq("id", user.id)
    .is("mode", null)
    .select("mode");
  if (error) {
    console.error("users mode update failed", error);
    return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });
  }
  if (!updated?.length) {
    return NextResponse.json({ error: "You've already chosen how you use dripp." }, { status: 409 });
  }

  return NextResponse.json({ mode: parsed.data.mode });
}
