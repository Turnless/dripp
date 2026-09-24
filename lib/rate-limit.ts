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
  // The Creator page refreshes its live numbers about once a minute.
  creatorStats: { perUser: 30, perIp: 150, windowSeconds: 60 },
  // Once per reward drop, before sending (up to 50 handles each).
  botCheck: { perUser: 10, perIp: 50, windowSeconds: 60 },
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

/**
 * Phone verification sends a paid message (SMS / WhatsApp) that dripp pays
 * for, so it's limited strictly -- and, unlike rateLimit(), fails CLOSED:
 * if the limiter can't be reached, no code is sent.
 *   - per person: 1 attempt every 5 minutes, and 3 a day
 *   - per network (IP): 10 a day
 *   - everyone together: PHONE_VERIFY_DAILY_CAP a day (default 100)
 * Returns a response to send back when refused, or null to carry on.
 *
 * This gates the app's "Verify phone" button. Privy sends the code itself,
 * so also set its own limits / allowed countries in the Privy dashboard.
 */
export const PHONE_VERIFY_LIMITS = {
  perUserShort: { limit: 1, windowSeconds: 5 * 60 },
  perUserDaily: 3,
  perIpDaily: 10,
  defaultGlobalDaily: 100,
};

export async function phoneVerifyLimit(req: Request, userId: string): Promise<NextResponse | null> {
  const db = supabaseServer();
  const refuse = (error: string, retryAfter: number, status = 429) =>
    NextResponse.json({ error }, { status, headers: { "Retry-After": String(retryAfter) } });

  const short = await db.rpc("hit_rate_limit", {
    p_keys: [`phoneVerify5m:u:${userId}`],
    p_limits: [PHONE_VERIFY_LIMITS.perUserShort.limit],
    p_window_seconds: PHONE_VERIFY_LIMITS.perUserShort.windowSeconds,
  });
  if (short.error) {
    console.error("phone verify limiter failed -- refusing", short.error);
    return refuse("Verification is unavailable right now. Please try again later.", 60, 503);
  }
  if (short.data === false) {
    return refuse("Please wait a few minutes before asking for another code.", PHONE_VERIFY_LIMITS.perUserShort.windowSeconds);
  }

  const globalCap = Number(process.env.PHONE_VERIFY_DAILY_CAP) || PHONE_VERIFY_LIMITS.defaultGlobalDaily;
  const keys = [`phoneVerifyDay:u:${userId}`, "phoneVerifyDay:all"];
  const limits = [PHONE_VERIFY_LIMITS.perUserDaily, globalCap];
  const ip = clientIp(req);
  if (ip) {
    keys.push(`phoneVerifyDay:ip:${ip}`);
    limits.push(PHONE_VERIFY_LIMITS.perIpDaily);
  }
  const daily = await db.rpc("hit_rate_limit", { p_keys: keys, p_limits: limits, p_window_seconds: 24 * 60 * 60 });
  if (daily.error) {
    console.error("phone verify limiter failed -- refusing", daily.error);
    return refuse("Verification is unavailable right now. Please try again later.", 60, 503);
  }
  if (daily.data === false) {
    return refuse("You've reached today's limit for verification codes. Please try again tomorrow.", 24 * 60 * 60);
  }
  return null;
}
