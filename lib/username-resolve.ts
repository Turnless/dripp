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

// How long a platform lookup is trusted. A handle that exists rarely stops
// existing; one that doesn't may be created any minute, so misses expire fast.
const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;

/**
 * Does this handle exist on the platform? Answered from the handle_lookups
 * cache when fresh, otherwise with ONE live platform API call whose result
 * is cached. If the live call fails (e.g. the API quota ran out), a handle
 * that was found before is still accepted, so tipping keeps working.
 */
async function platformHandleExists(platform: "youtube" | "kick", username: string): Promise<boolean> {
  const db = supabaseServer();
  const { data: cached, error: cacheErr } = await db
    .from("handle_lookups")
    .select("found, checked_at")
    .eq("platform", platform)
    .eq("platform_username", username)
    .maybeSingle();
  if (cacheErr) console.error("handle_lookups read failed", cacheErr);

  if (cached) {
    const age = Date.now() - Date.parse(cached.checked_at);
    if (cached.found && age < FOUND_TTL_MS) return true;
    if (!cached.found && age < NOT_FOUND_TTL_MS) return false;
  }

  let found: boolean;
  let channelId: string | null;
  try {
    const result =
      platform === "youtube" ? await lookupYoutubeHandle(username) : await lookupKickUsername(username);
    found = !!result;
    channelId = result?.channelId ?? null;
  } catch (err) {
    if (cached?.found) {
      console.warn("platform lookup failed -- using the earlier result", { platform, username, err });
      return true;
    }
    throw err;
  }

  const { error: saveErr } = await db.from("handle_lookups").upsert({
    platform,
    platform_username: username,
    found,
    channel_id: channelId,
    checked_at: new Date().toISOString(),
  });
  if (saveErr) console.error("handle_lookups write failed", saveErr);
  return found;
}

/**
 * Resolves a tip recipient in the order described in the architecture doc:
 *   1. Check our own database first (indexed lookup -- the Instagram/X pattern).
 *   2. Only if not found there, check the handle on the named platform
 *      (cached; at most ONE live API call), before creating a pending tip.
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

  if (!(await platformHandleExists(platform, username))) return { status: "not_found" };

  return { status: "verified_unclaimed", platform, platformUsername: username };
}
