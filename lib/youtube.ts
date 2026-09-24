/**
 * Single-handle YouTube channel lookup.
 *
 * Confirmed via the YouTube Data API v3 reference (developers.google.com/youtube/v3/docs/channels/list):
 * `channels.list` accepts a `forHandle` parameter that resolves exactly one
 * handle (e.g. "@somechannel") to its channel resource -- this is the
 * single-lookup pattern the architecture doc relies on for verifying an
 * unclaimed username before creating a pending tip. It does not require OAuth
 * for this specific read -- an API key is enough.
 */
export interface YoutubeChannelLookup {
  channelId: string;
  title: string;
  subscriberCount: number | null;
}

export async function lookupYoutubeHandle(
  handle: string
): Promise<YoutubeChannelLookup | null> {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("forHandle", cleanHandle);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const item = json.items?.[0];
  if (!item) return null;

  return {
    channelId: item.id,
    title: item.snippet?.title ?? cleanHandle,
    subscriberCount: item.statistics?.hiddenSubscriberCount
      ? null
      : Number(item.statistics?.subscriberCount ?? 0),
  };
}

/**
 * A channel's current subscriber count by channel ID (the Creator page's
 * live count). YouTube returns it rounded to 3 significant figures, and null
 * when the channel hides it. Cached for a minute, so a channel costs at
 * most one API call a minute however often its Creator page refreshes.
 */
export async function youtubeSubscriberCount(channelId: string): Promise<number | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
  }
  const stats = (await res.json()).items?.[0]?.statistics;
  if (!stats || stats.hiddenSubscriberCount) return null;
  return Number(stats.subscriberCount ?? 0);
}

export type YoutubeChannelFacts = {
  publishedAt: Date;
  videoCount: number;
  subscriberCount: number | null;
};

/**
 * Age, video count and subscribers for up to 50 channels in one call (the
 * reward-drop bot check, lib/bot-check.ts). Channels YouTube doesn't return
 * are simply missing from the map.
 */
export async function youtubeChannelFacts(channelIds: string[]): Promise<Map<string, YoutubeChannelFacts>> {
  const out = new Map<string, YoutubeChannelFacts>();
  const ids = Array.from(new Set(channelIds)).slice(0, 50);
  if (!ids.length) return out;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
  }
  for (const item of (await res.json()).items ?? []) {
    const publishedAt = new Date(item.snippet?.publishedAt ?? NaN);
    if (!item.id || Number.isNaN(publishedAt.getTime())) continue;
    out.set(item.id, {
      publishedAt,
      videoCount: Number(item.statistics?.videoCount ?? 0),
      subscriberCount: item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? 0),
    });
  }
  return out;
}
