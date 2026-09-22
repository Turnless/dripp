/**
 * Single-username Kick channel lookup.
 *
 * *** VERIFY BEFORE USE ***
 * Kick's public API is newer than YouTube's and its exact endpoint shape can
 * still move -- confirm the current channel-lookup route and response fields
 * against Kick's own published API docs before relying on this in production.
 * The shape below (GET a channel by slug, read a boolean "verified"/exists
 * flag) matches the general pattern most channel-lookup APIs use, but treat
 * the literal path and field names as placeholders to double-check.
 */
export interface KickChannelLookup {
  channelId: string;
  username: string;
  followerCount: number | null;
}

export async function lookupKickUsername(
  username: string
): Promise<KickChannelLookup | null> {
  const clientId = process.env.KICK_CLIENT_ID;
  if (!clientId) throw new Error("KICK_CLIENT_ID is not set");

  // TODO: confirm this endpoint against current Kick API documentation.
  const url = `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(
    username
  )}`;

  const res = await fetch(url, {
    headers: { "Client-Id": clientId },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Kick API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const item = json?.data?.[0];
  if (!item) return null;

  return {
    channelId: String(item.id ?? item.channel_id ?? username),
    username: item.slug ?? username,
    followerCount: item.followers_count ?? null,
  };
}
