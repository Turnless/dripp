import { supabaseServer } from "./supabase";
import { lookupYoutubeHandle } from "./youtube";
import { lookupKickUsername } from "./kick";

type Platform = "youtube" | "kick";

export type ResolvedRecipient =
  | { status: "existing_user"; userId: string; walletAddress: `0x${string}` }
  | { status: "verified_unclaimed"; platform: Platform; platformUsername: string; channelId: string }
  | { status: "not_found" };

/**
 * Canonical form of a platform handle: no leading "@", trimmed, lowercase.
 * YouTube handles and Kick slugs are case-insensitive, so "@NewCreator" and
 * "newcreator" MUST normalize to the same string. Use this everywhere a
 * handle is stored, compared, or hashed.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

// How long a platform lookup is trusted. A handle rarely changes owner; one
// that doesn't exist may be created any minute, so misses expire fast.
const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;

type Channel = { found: false } | { found: true; channelId: string };

/**
 * Which channel does this handle belong to on the platform right now?
 * Answered from the handle_lookups cache when fresh, otherwise with ONE live
 * platform API call whose result is cached. If the live call fails (e.g. the
 * API quota ran out), an earlier positive answer is still used, so tipping
 * keeps working.
 */
async function platformChannel(platform: Platform, username: string): Promise<Channel> {
  const db = supabaseServer();
  const { data: cached, error: cacheErr } = await db
    .from("handle_lookups")
    .select("found, channel_id, checked_at")
    .eq("platform", platform)
    .eq("platform_username", username)
    .maybeSingle();
  if (cacheErr) console.error("handle_lookups read failed", cacheErr);

  // A positive entry without a channel ID predates channel IDs being cached:
  // treat it as stale so it's looked up again.
  const cachedChannel: Channel | null = !cached
    ? null
    : !cached.found
      ? { found: false }
      : cached.channel_id
        ? { found: true, channelId: cached.channel_id }
        : null;

  if (cached && cachedChannel) {
    const age = Date.now() - Date.parse(cached.checked_at);
    if (cachedChannel.found ? age < FOUND_TTL_MS : age < NOT_FOUND_TTL_MS) return cachedChannel;
  }

  let channel: Channel;
  try {
    const result =
      platform === "youtube" ? await lookupYoutubeHandle(username) : await lookupKickUsername(username);
    channel = result ? { found: true, channelId: result.channelId } : { found: false };
  } catch (err) {
    if (cachedChannel?.found) {
      console.warn("platform lookup failed -- using the earlier result", { platform, username, err });
      return cachedChannel;
    }
    throw err;
  }

  const { error: saveErr } = await db.from("handle_lookups").upsert({
    platform,
    platform_username: username,
    found: channel.found,
    channel_id: channel.found ? channel.channelId : null,
    checked_at: new Date().toISOString(),
  });
  if (saveErr) console.error("handle_lookups write failed", saveErr);
  return channel;
}

type LinkRow = { user_id: string; channel_id: string | null; users: unknown };

const asRecipient = (link: LinkRow): ResolvedRecipient => ({
  status: "existing_user",
  userId: link.user_id,
  // Supabase's generated types for joined tables aren't modeled here.
  walletAddress: (link.users as { wallet_address: string } | null)?.wallet_address as `0x${string}`,
});

/**
 * Resolves a tip recipient. The platform's channel ID is the identity -- a
 * handle only says which channel is meant *right now*:
 *   1. Ask which channel the handle belongs to (cached platform lookup; this
 *      never bulk-syncs a platform's usernames -- see 04-architecture.md).
 *   2. If that channel is linked on dripp, the tip goes straight to its
 *      owner. A link recorded under this handle for a *different* channel is
 *      stale (renamed/reassigned handle) and is ignored.
 *   3. Otherwise it's escrowed under the channel (see lib/tipvault.ts).
 * If the platform can't be reached, a link under this handle is trusted.
 */
export async function resolveRecipient(platform: Platform, usernameRaw: string): Promise<ResolvedRecipient> {
  const username = normalizeHandle(usernameRaw);
  const db = supabaseServer();

  const { data: byHandle, error } = await db
    .from("platform_links")
    .select("user_id, channel_id, users(wallet_address)")
    .eq("platform", platform)
    .eq("platform_username", username)
    .maybeSingle();
  if (error) throw error;

  let channel: Channel;
  try {
    channel = await platformChannel(platform, username);
  } catch (err) {
    if (!byHandle) throw err;
    console.warn("platform lookup failed -- trusting the linked handle", { platform, username, err });
    return asRecipient(byHandle as LinkRow);
  }

  if (!channel.found) return { status: "not_found" };

  if (byHandle && byHandle.channel_id === channel.channelId) return asRecipient(byHandle as LinkRow);

  const { data: byChannel, error: channelErr } = await db
    .from("platform_links")
    .select("user_id, channel_id, users(wallet_address)")
    .eq("platform", platform)
    .eq("channel_id", channel.channelId)
    .maybeSingle();
  if (channelErr) throw channelErr;
  if (byChannel) return asRecipient(byChannel as LinkRow);

  // Linked before channel IDs were stored: trusted until its owner links
  // again, which records the channel (link_platform_account).
  if (byHandle && !byHandle.channel_id) return asRecipient(byHandle as LinkRow);

  return { status: "verified_unclaimed", platform, platformUsername: username, channelId: channel.channelId };
}
