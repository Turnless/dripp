import { NextRequest, NextResponse } from "next/server";
import { resolveRecipient } from "@/lib/username-resolve";
import { getAuthenticatedPrivyId } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Lightweight GET used by the frontend to show "this looks like a real
 * account" before the user commits to sending a tip -- same resolution logic
 * as the tip route, exposed read-only.
 *
 * Signed-in callers only (each miss costs a live YouTube/Kick API call, so an
 * open endpoint is a free way to burn our API quota), and it returns only the
 * status -- never the recipient's user ID or wallet address.
 */
export async function GET(req: NextRequest) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "resolve", privyId);
  if (limited) return limited;

  const platform = req.nextUrl.searchParams.get("platform");
  const username = req.nextUrl.searchParams.get("username")?.trim();

  if (
    (platform !== "youtube" && platform !== "kick" && platform !== "dripp") ||
    !username ||
    username.length > 100
  ) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const result = await resolveRecipient(platform, username);
  return NextResponse.json({ status: result.status });
}
