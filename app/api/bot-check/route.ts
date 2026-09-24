import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase";
import { MAX_BULK_RECIPIENTS } from "@/lib/fees";
import { normalizeHandle, platformChannel } from "@/lib/username-resolve";
import { youtubeChannelFacts, type YoutubeChannelFacts } from "@/lib/youtube";
import { classifyChannel, type RecipientVerdict } from "@/lib/bot-check";
import { classifiedTippers } from "@/lib/tipper-check";

const BodySchema = z.object({
  platform: z.enum(["youtube", "kick"]),
  handles: z.array(z.string().min(1).max(100)).min(1).max(MAX_BULK_RECIPIENTS),
});

export type RecipientCheck = { handle: string } & RecipientVerdict;

/**
 * Checks a reward drop's recipients before a creator sends it (PRD 7.4 /
 * 8.5). A handle is flagged when its YouTube channel looks like a throwaway
 * (new, no videos, almost no subscribers) or when its owner is on dripp and
 * was part of a swarm of new accounts tipping this creator. Handles that
 * can't be checked (Kick, not found, the API is down) come back "unknown"
 * and are never flagged.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "botCheck", user.id);
  if (limited) return limited;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { platform } = parsed.data;
  const handles = Array.from(new Set(parsed.data.handles.map(normalizeHandle)));

  if (platform !== "youtube") {
    return NextResponse.json({
      results: handles.map((handle) => ({ handle, verdict: "unknown", reason: "Kick accounts can't be checked yet" })),
    });
  }

  // Handle -> channel (cached lookups, one API call per uncached handle).
  const channels = new Map<string, string>();
  await Promise.all(
    handles.map(async (h) => {
      try {
        const c = await platformChannel(platform, h);
        if (c.found) channels.set(h, c.channelId);
      } catch (err) {
        console.error("bot check: channel lookup failed", h, err);
      }
    })
  );
  const ids = Array.from(new Set(channels.values()));

  let facts = new Map<string, YoutubeChannelFacts>();
  try {
    facts = await youtubeChannelFacts(ids);
  } catch (err) {
    console.error("bot check: channel details failed", err);
  }

  // Recipients who are on dripp and were part of a swarm tipping this creator.
  const swarmChannels = new Map<string, string>();
  try {
    const suspicious = (await classifiedTippers(user.id)).filter((t) => t.verdict === "suspicious");
    if (suspicious.length && ids.length) {
      const { data: links } = await supabaseServer()
        .from("platform_links")
        .select("user_id, channel_id")
        .eq("platform", "youtube")
        .in("channel_id", ids)
        .in("user_id", suspicious.map((s) => s.senderId));
      for (const l of links ?? []) {
        const reason = suspicious.find((s) => s.senderId === l.user_id)?.reason;
        if (l.channel_id && reason) swarmChannels.set(l.channel_id, reason);
      }
    }
  } catch (err) {
    console.error("bot check: tipper check failed", err);
  }

  const results: RecipientCheck[] = handles.map((handle) => {
    const id = channels.get(handle);
    if (!id) return { handle, verdict: "unknown", reason: "Couldn't find this channel" };
    const swarm = swarmChannels.get(id);
    if (swarm) return { handle, verdict: "suspicious", reason: swarm };
    const f = facts.get(id);
    if (!f) return { handle, verdict: "unknown", reason: "Couldn't check this channel right now" };
    return { handle, ...classifyChannel(f) };
  });

  return NextResponse.json({ results });
}
