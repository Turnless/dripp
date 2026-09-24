import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase";
import { MAX_BULK_RECIPIENTS } from "@/lib/fees";
import { normalizeHandle, platformChannel } from "@/lib/username-resolve";
import { recipientVerdict, type RecipientVerdict } from "@/lib/bot-check";
import { classifiedTippers } from "@/lib/tipper-check";
import { verificationsFor } from "@/lib/viewer-verification";

const BodySchema = z.object({
  platform: z.enum(["youtube", "kick"]),
  handles: z.array(z.string().min(1).max(100)).min(1).max(MAX_BULK_RECIPIENTS),
});

export type RecipientCheck = { handle: string } & RecipientVerdict;

/**
 * Checks a reward drop's recipients before a creator sends it (PRD 7.4 /
 * 8.5): for each handle on dripp, whether its owner is a verified viewer
 * (lib/bot-check.ts) and whether they were part of a swarm of new accounts
 * tipping this creator. Handles not on dripp yet come back "not_joined"
 * (their tip waits in escrow); anything that can't be looked up, "unknown".
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

  try {
    // Channel -> dripp user, their verification, and this creator's swarm verdicts.
    const ids = Array.from(new Set(channels.values()));
    const { data: links, error } = ids.length
      ? await supabaseServer()
          .from("platform_links")
          .select("user_id, channel_id")
          .eq("platform", platform)
          .in("channel_id", ids)
      : { data: [], error: null };
    if (error) throw error;
    const owner = new Map((links ?? []).map((l) => [l.channel_id as string, l.user_id as string]));
    const [verified, tippers] = await Promise.all([
      verificationsFor(Array.from(new Set(owner.values()))),
      classifiedTippers(user.id),
    ]);
    const swarm = new Map(tippers.filter((t) => t.verdict === "suspicious").map((t) => [t.senderId, t.reason]));

    const results: RecipientCheck[] = handles.map((handle) => {
      const id = channels.get(handle);
      if (!id) return { handle, verdict: "unknown", reason: "Couldn't find this channel" };
      const userId = owner.get(id);
      if (!userId) return { handle, ...recipientVerdict(false, null, null) };
      return { handle, ...recipientVerdict(true, verified.get(userId) ?? null, swarm.get(userId) ?? null) };
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error("bot check failed", err);
    return NextResponse.json({ error: "We couldn't check these right now." }, { status: 500 });
  }
}
