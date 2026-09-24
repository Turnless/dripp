import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase";

/**
 * Per-user and per-IP request limits for API routes, counted in Postgres
 * (hit_rate_limit in supabase/functions.sql) so they hold across serverless
 * instances. An IP is shared by everyone behind the same network (mobile
 * carriers, offices), so its limit is several times the per-user one.
 *
 * This protects the platform API quota, the RPC allowance and the database.
 * It can't protect gas sponsorship -- the paymaster sponsors whatever a
 * smart wallet sends, whether or not it went through these routes -- which
 * is capped by the sponsorship policy in the paymaster's dashboard.
 */

type Limit = { perUser: number; perIp: number; windowSeconds: number };

export const LIMITS = {
  // Typing a handle is debounced to at most ~2 lookups a second.
  resolve: { perUser: 60, perIp: 300, windowSeconds: 60 },
  // Bulk send prepares one tip per recipient (up to 50 at a time).
  tipPrepare: { perUser: 60, perIp: 300, windowSeconds: 60 },
  // Confirm is retried while the transaction becomes visible.
  tipConfirm: { perUser: 120, perIp: 600, windowSeconds: 60 },
  balance: { perUser: 60, perIp: 300, windowSeconds: 60 },
  withdraw: { perUser: 20, perIp: 100, windowSeconds: 60 },
  platformLink: { perUser: 10, perIp: 50, windowSeconds: 60 },
  // Checked once per app load; confirm is retried like tip confirm.
  refunds: { perUser: 30, perIp: 150, windowSeconds: 60 },
} satisfies Record<string, Limit>;

function clientIp(req: Request): string | null {
  // Set by the hosting platform (Vercel) -- the first entry is the client.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

/**
 * Counts this request. Returns a 429 response to send back if the caller is
 * over a limit, or null to carry on. Fails open (logs and allows) if the
 * database can't be reached, so a limiter problem never blocks payments.
 */
export async function rateLimit(
  req: Request,
  name: keyof typeof LIMITS,
  userId: string
): Promise<NextResponse | null> {
  const limit: Limit = LIMITS[name];
  const keys = [`${name}:u:${userId}`];
  const limits = [limit.perUser];
  const ip = clientIp(req);
  if (ip) {
    keys.push(`${name}:ip:${ip}`);
    limits.push(limit.perIp);
  }

  const { data: allowed, error } = await supabaseServer().rpc("hit_rate_limit", {
    p_keys: keys,
    p_limits: limits,
    p_window_seconds: limit.windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed -- allowing", error);
    return null;
  }
  if (allowed === false) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.windowSeconds) } }
    );
  }
  return null;
}
