import { supabaseServer } from "./supabase";
import { lookupYoutubeHandle } from "./youtube";
import { lookupKickUsername } from "./kick";

export type ResolvedRecipient =
  | { status: "existing_user"; userId: string; walletAddress: `0x${string}` }
  | { status: "verified_unclaimed"; platform: "youtube" | "kick"; platformUsername: string }
  | { status: "not_found" };

/**
 * Canonical form of a platform handle: no leading "@", trimmed, lowercase.
 * YouTube handles and Kick slugs are case-insensitive, and the TipVault
 * escrow key is keccak256("<platform>:<handle>") -- so "@NewCreator" and
 * "newcreator" MUST normalize to the same string, or a pending tip becomes
 * unclaimable. Use this everywhere a handle is stored, compared, or hashed.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Resolves a tip recipient in the order described in the architecture doc:
 *   1. Check our own database first (indexed lookup -- the Instagram/X pattern).
 *   2. Only if not found there, make ONE live call to the named platform's
 *      public API to confirm the handle is real, before creating a pending tip.
 * This never bulk-syncs a platform's usernames -- see 04-architecture.md.
 */
export async function resolveRecipient(
  platform: "youtube" | "kick",
  usernameRaw: string
): Promise<ResolvedRecipient> {
  const username = normalizeHandle(usernameRaw);
  const db = supabaseServer();

  const { data: link, error } = await db
    .from("platform_links")
    .select("user_id, users(wallet_address)")
    .eq("platform", platform)
    .eq("platform_username", username)
    .maybeSingle();

  if (error) throw error;

  if (link) {
    // @ts-expect-error -- Supabase's generated types for joined tables aren't
    // modeled in this scaffold; add generated types via `supabase gen types`.
    const walletAddress = link.users?.wallet_address as `0x${string}`;
    return { status: "existing_user", userId: link.user_id, walletAddress };
  }

  const verified =
    platform === "youtube"
      ? await lookupYoutubeHandle(username)
      : await lookupKickUsername(username);

  if (!verified) return { status: "not_found" };

  return { status: "verified_unclaimed", platform, platformUsername: username };
}
