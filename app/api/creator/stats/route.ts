import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase";
import { youtubeSubscriberCount } from "@/lib/youtube";

export type CreatorStats = {
  /** Null when the channel hides its count, isn't linked (by channel ID) yet, or YouTube can't be reached. */
  subscribers: number | null;
};

/** Live numbers for the signed-in creator's linked YouTube channel. */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "creatorStats", user.id);
  if (limited) return limited;

  const { data: link } = await supabaseServer()
    .from("platform_links")
    .select("channel_id")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .not("channel_id", "is", null)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let subscribers: number | null = null;
  if (link?.channel_id) {
    try {
      subscribers = await youtubeSubscriberCount(link.channel_id);
    } catch (err) {
      console.error("subscriber count failed", err);
    }
  }
  return NextResponse.json({ subscribers } satisfies CreatorStats);
}
