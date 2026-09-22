import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { supabaseServer } from "@/lib/supabase";

export type ActivityItem = {
  id: string;
  direction: "sent" | "received" | "withdrawn";
  status: "settled" | "waiting" | "collected";
  cents: number;
  feeCents?: number;
  counterparty: string | null; // "@handle", or null for withdrawals
  at: string;
};

const toCents = (amount: string | number) => Math.round(Number(amount) * 100);

/**
 * The signed-in user's history: direct tips (sent + received), escrowed tips
 * they sent (waiting / collected), escrowed tips they collected, and
 * withdrawals. Counterparties are shown by platform handle, never by address.
 */
export async function GET(req: NextRequest) {
  const me = await getAuthenticatedUser(req);
  if (!me) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
  const db = supabaseServer();

  const [tips, sentPending, collected, withdrawals] = await Promise.all([
    db
      .from("tips")
      .select("id, sender_id, recipient_id, amount, created_at")
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("pending_tips")
      .select("id, platform_username, amount, claimed_at, created_at")
      .eq("sender_id", me.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("pending_tips")
      .select("id, sender_id, amount, claimed_at")
      .eq("claimed_by", me.id)
      .order("claimed_at", { ascending: false })
      .limit(limit),
    db
      .from("withdrawals")
      .select("id, amount, fee, created_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  // Handles for everyone we need to name.
  const otherIds = new Set<string>();
  tips.data?.forEach((t) => otherIds.add(t.sender_id === me.id ? t.recipient_id : t.sender_id));
  collected.data?.forEach((c) => otherIds.add(c.sender_id));
  const names = new Map<string, string>();
  if (otherIds.size) {
    const { data: links } = await db
      .from("platform_links")
      .select("user_id, platform_username")
      .in("user_id", Array.from(otherIds));
    links?.forEach((l) => names.set(l.user_id, `@${l.platform_username}`));
  }

  const items: ActivityItem[] = [
    ...(tips.data ?? []).map((t): ActivityItem => {
      const sent = t.sender_id === me.id;
      return {
        id: `tip-${t.id}`,
        direction: sent ? "sent" : "received",
        status: "settled",
        cents: toCents(t.amount),
        counterparty: names.get(sent ? t.recipient_id : t.sender_id) ?? null,
        at: t.created_at,
      };
    }),
    ...(sentPending.data ?? []).map(
      (p): ActivityItem => ({
        id: `pending-${p.id}`,
        direction: "sent",
        status: p.claimed_at ? "collected" : "waiting",
        cents: toCents(p.amount),
        counterparty: `@${p.platform_username}`,
        at: p.created_at,
      })
    ),
    ...(collected.data ?? []).map(
      (c): ActivityItem => ({
        id: `collected-${c.id}`,
        direction: "received",
        status: "collected",
        cents: toCents(c.amount),
        counterparty: names.get(c.sender_id) ?? null,
        at: c.claimed_at as string,
      })
    ),
    ...(withdrawals.data ?? []).map(
      (w): ActivityItem => ({
        id: `withdrawal-${w.id}`,
        direction: "withdrawn",
        status: "settled",
        cents: toCents(w.amount),
        feeCents: toCents(w.fee),
        counterparty: null,
        at: w.created_at,
      })
    ),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);

  return NextResponse.json({ items });
}
