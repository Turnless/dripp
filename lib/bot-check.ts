/**
 * Lightweight bot/real heuristics (PRD 8.5). Pure functions -- the data comes
 * from `tipper_signals` (supabase/functions.sql) and the YouTube API -- so the
 * rules are easy to test and to tune. They're signals, not proof: the UI says
 * "looks like", and a creator can always include someone anyway.
 *
 * Not checked yet: where a wallet's money came from (a funding-source
 * cluster). That needs an onchain indexer; the RPC can't scan a wallet's
 * whole history cheaply.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Joined this close to their first tip to this creator = a "fresh" account. */
export const FRESH_ACCOUNT_MS = HOUR;
/** Fresh accounts whose first tips land within this window of each other... */
export const SWARM_WINDOW_MS = 30 * 60 * 1000;
/** ...and number at least this many are treated as a swarm. */
export const SWARM_MIN_ACCOUNTS = 3;
/** An account this old, with some history, looks like a real person. */
export const ESTABLISHED_ACCOUNT_MS = 7 * DAY;

export type TipperSignals = {
  senderId: string;
  accountCreatedAt: Date;
  hasVerifiedChannel: boolean;
  firstTipAt: Date;
  /** Different people this account has tipped, ever. */
  recipientsCount: number;
  /** Different days this account has tipped on, ever. */
  activeDays: number;
};

export type TipperVerdict = "real" | "new" | "suspicious";

export type ClassifiedTipper = { senderId: string; verdict: TipperVerdict; reason: string };

/**
 * Sorts a creator's tippers into:
 *   real       -- verified a channel, or an account over 7 days old that has
 *                 tipped more than one person or on more than one day
 *   suspicious -- part of a swarm: at least 3 accounts that each signed up
 *                 within an hour of first tipping this creator, all within
 *                 30 minutes of each other (typical of a viewbot run)
 *   new        -- everyone else: not enough history to tell yet
 * A verified channel is never suspicious.
 */
export function classifyTippers(tippers: TipperSignals[], now: Date = new Date()): ClassifiedTipper[] {
  const fresh = tippers
    .filter((t) => !t.hasVerifiedChannel && t.firstTipAt.getTime() - t.accountCreatedAt.getTime() < FRESH_ACCOUNT_MS)
    .sort((a, b) => a.firstTipAt.getTime() - b.firstTipAt.getTime());

  const swarm = new Map<string, number>(); // senderId -> accounts in its window (incl. itself)
  for (const t of fresh) {
    const at = t.firstTipAt.getTime();
    const near = fresh.filter((o) => Math.abs(o.firstTipAt.getTime() - at) <= SWARM_WINDOW_MS).length;
    if (near >= SWARM_MIN_ACCOUNTS) swarm.set(t.senderId, near);
  }

  return tippers.map((t) => {
    if (t.hasVerifiedChannel) {
      return { senderId: t.senderId, verdict: "real", reason: "Verified their own channel" };
    }
    const near = swarm.get(t.senderId);
    if (near) {
      return {
        senderId: t.senderId,
        verdict: "suspicious",
        reason: `Joined minutes before tipping, along with ${near - 1} other new ${near - 1 === 1 ? "account" : "accounts"}`,
      };
    }
    const age = now.getTime() - t.accountCreatedAt.getTime();
    if (age >= ESTABLISHED_ACCOUNT_MS && (t.recipientsCount >= 2 || t.activeDays >= 2)) {
      return { senderId: t.senderId, verdict: "real", reason: "Established account with a tipping history" };
    }
    return { senderId: t.senderId, verdict: "new", reason: "Not enough history yet" };
  });
}

export type Breakdown = { total: number; real: number; new: number; suspicious: number };

export function breakdown(classified: ClassifiedTipper[]): Breakdown {
  const out: Breakdown = { total: classified.length, real: 0, new: 0, suspicious: 0 };
  for (const c of classified) out[c.verdict]++;
  return out;
}

// ---------- reward drops: checking a platform account before tipping it ----------

/** A channel younger than this, with no videos and almost no subscribers, looks like a throwaway. */
export const NEW_CHANNEL_MS = 30 * DAY;
export const FEW_SUBSCRIBERS = 10;

export type ChannelFacts = {
  publishedAt: Date;
  videoCount: number;
  /** Null when the channel hides it. */
  subscriberCount: number | null;
};

export type RecipientVerdict =
  | { verdict: "ok" }
  | { verdict: "suspicious"; reason: string }
  | { verdict: "unknown"; reason: string };

export function classifyChannel(facts: ChannelFacts, now: Date = new Date()): RecipientVerdict {
  const age = now.getTime() - facts.publishedAt.getTime();
  if (age < NEW_CHANNEL_MS && facts.videoCount === 0 && (facts.subscriberCount ?? 0) < FEW_SUBSCRIBERS) {
    const days = Math.max(0, Math.floor(age / DAY));
    return {
      verdict: "suspicious",
      reason: `Channel is ${days === 0 ? "less than a day" : `${days} ${days === 1 ? "day" : "days"}`} old with no videos`,
    };
  }
  return { verdict: "ok" };
}
