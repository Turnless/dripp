/**
 * Bot/real rules (PRD 8.5). Pure functions -- the data comes from SQL
 * (`tipper_signals`, `viewer_verifications`) and the YouTube API -- so the
 * rules are easy to test and tune. Viewers never see these thresholds; they
 * only see whether they're verified.
 *
 * A person is verified by ANY of:
 *   - an established YouTube account, checked when they link it: channel
 *     older than 3 months, subscribed to more than 10 channels, and 20 or
 *     more liked videos (viewers don't need to upload anything)
 *   - a phone number verified through Privy
 *   - having tipped at least $1 of their own money (later: a top-up)
 *
 * Not checked yet: where a wallet's money came from (needs an onchain indexer).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------- the YouTube viewer check (run when a channel is linked) ----------

export const VIEWER_MIN_CHANNEL_AGE_MS = 90 * DAY;
/** "More than 10" subscriptions. */
export const VIEWER_MIN_SUBSCRIPTIONS = 11;
export const VIEWER_MIN_LIKED_VIDEOS = 20;
/** Own money tipped that counts as verification. Keep in step with viewer_verifications (functions.sql). */
export const MIN_TIPPED_CENTS = 100;

export type YoutubeViewerFacts = {
  channelCreatedAt: Date;
  subscriptions: number;
  likedVideos: number;
};

export function passesYoutubeViewerCheck(f: YoutubeViewerFacts, now: Date = new Date()): boolean {
  return (
    now.getTime() - f.channelCreatedAt.getTime() >= VIEWER_MIN_CHANNEL_AGE_MS &&
    f.subscriptions >= VIEWER_MIN_SUBSCRIPTIONS &&
    f.likedVideos >= VIEWER_MIN_LIKED_VIDEOS
  );
}

/** youtube / phone / topup are proofs of their own; 'tipped' is computed from tips. */
export type VerifiedVia = "youtube" | "phone" | "topup" | "tipped";
const STRONG: VerifiedVia[] = ["youtube", "phone", "topup"];

export const VERIFIED_VIA_TEXT: Record<VerifiedVia, string> = {
  youtube: "Verified with their YouTube account",
  phone: "Verified their phone number",
  topup: "Added money with a card",
  tipped: "Has tipped with their own money",
};

/** Joined this close to their first tip to this creator = a "fresh" account. */
export const FRESH_ACCOUNT_MS = HOUR;
/** Fresh accounts whose first tips land within this window of each other... */
export const SWARM_WINDOW_MS = 30 * 60 * 1000;
/** ...and number at least this many are treated as a swarm. */
export const SWARM_MIN_ACCOUNTS = 3;

export type TipperSignals = {
  senderId: string;
  accountCreatedAt: Date;
  firstTipAt: Date;
  /** How they're verified as a person, or null (viewer_verifications). */
  verifiedVia: VerifiedVia | null;
};

export type TipperVerdict = "real" | "new" | "suspicious";

export type ClassifiedTipper = { senderId: string; verdict: TipperVerdict; reason: string };

/**
 * Sorts a creator's tippers into:
 *   real       -- verified (youtube / phone / top-up, or tipped $1+ of their
 *                 own money)
 *   suspicious -- part of a swarm: at least 3 accounts that each signed up
 *                 within an hour of first tipping this creator, all within
 *                 30 minutes of each other (typical of a viewbot run). Only
 *                 a youtube / phone / top-up verification overrides this --
 *                 a farm can afford a dollar per account.
 *   new        -- everyone else: not verified yet
 */
export function classifyTippers(tippers: TipperSignals[]): ClassifiedTipper[] {
  const strong = (t: TipperSignals) => !!t.verifiedVia && STRONG.includes(t.verifiedVia);
  const fresh = tippers
    .filter((t) => !strong(t) && t.firstTipAt.getTime() - t.accountCreatedAt.getTime() < FRESH_ACCOUNT_MS)
    .sort((a, b) => a.firstTipAt.getTime() - b.firstTipAt.getTime());

  const swarm = new Map<string, number>(); // senderId -> accounts in its window (incl. itself)
  for (const t of fresh) {
    const at = t.firstTipAt.getTime();
    const near = fresh.filter((o) => Math.abs(o.firstTipAt.getTime() - at) <= SWARM_WINDOW_MS).length;
    if (near >= SWARM_MIN_ACCOUNTS) swarm.set(t.senderId, near);
  }

  return tippers.map((t) => {
    if (strong(t)) {
      return { senderId: t.senderId, verdict: "real", reason: VERIFIED_VIA_TEXT[t.verifiedVia!] };
    }
    const near = swarm.get(t.senderId);
    if (near) {
      return {
        senderId: t.senderId,
        verdict: "suspicious",
        reason: `Joined minutes before tipping, along with ${near - 1} other new ${near - 1 === 1 ? "account" : "accounts"}`,
      };
    }
    if (t.verifiedVia === "tipped") {
      return { senderId: t.senderId, verdict: "real", reason: VERIFIED_VIA_TEXT.tipped };
    }
    return { senderId: t.senderId, verdict: "new", reason: "Not verified yet" };
  });
}

export type Breakdown = { total: number; real: number; new: number; suspicious: number };

export function breakdown(classified: ClassifiedTipper[]): Breakdown {
  const out: Breakdown = { total: classified.length, real: 0, new: 0, suspicious: 0 };
  for (const c of classified) out[c.verdict]++;
  return out;
}

// ---------- reward drops: checking recipients before tipping them ----------

/**
 * What a streamer sees next to each person in a reward drop. Verification
 * only matters for receiving group rewards: unverified and suspicious people
 * are skipped by default (the streamer can include them); people not on
 * dripp yet are included -- their tip waits for them.
 */
export type RecipientVerdict =
  | { verdict: "verified"; reason: string }
  | { verdict: "unverified"; reason: string }
  | { verdict: "suspicious"; reason: string }
  | { verdict: "not_joined"; reason: string }
  | { verdict: "unknown"; reason: string };

export const SKIP_BY_DEFAULT: RecipientVerdict["verdict"][] = ["unverified", "suspicious"];

export function recipientVerdict(
  onDripp: boolean,
  verifiedVia: VerifiedVia | null,
  swarmReason: string | null
): RecipientVerdict {
  if (!onDripp) return { verdict: "not_joined", reason: "Not on dripp yet. Their tip waits for them" };
  const strong = !!verifiedVia && STRONG.includes(verifiedVia);
  if (swarmReason && !strong) return { verdict: "suspicious", reason: swarmReason };
  if (verifiedVia) return { verdict: "verified", reason: VERIFIED_VIA_TEXT[verifiedVia] };
  return { verdict: "unverified", reason: "Hasn't verified yet" };
}
