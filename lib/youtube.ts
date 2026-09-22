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
