import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { breakdown, type Breakdown } from "@/lib/bot-check";
import { TIPPER_WINDOW_DAYS, classifiedTippers } from "@/lib/tipper-check";

export type TipperBreakdown = Breakdown & { windowDays: number };

/**
 * The Creator page's "Who's tipping you": how many of the people who tipped
 * the caller in the last 30 days look real, are new, or look like a swarm of
 * throwaway accounts. Counts only -- never who.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "creatorStats", user.id);
  if (limited) return limited;

  try {
    const result = breakdown(await classifiedTippers(user.id));
    return NextResponse.json({ ...result, windowDays: TIPPER_WINDOW_DAYS } satisfies TipperBreakdown);
  } catch (err) {
    console.error("tipper breakdown failed", err);
    return NextResponse.json({ error: "We couldn't load this right now." }, { status: 500 });
  }
}
