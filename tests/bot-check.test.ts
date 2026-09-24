import { describe, expect, it } from "vitest";
import {
  SKIP_BY_DEFAULT,
  breakdown,
  classifyTippers,
  passesYoutubeViewerCheck,
  recipientVerdict,
  type TipperSignals,
} from "@/lib/bot-check";

const NOW = new Date("2026-09-24T12:00:00Z");
const minutes = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);
const days = (d: number) => minutes(d * 24 * 60);

describe("YouTube viewer check (run when a channel is linked)", () => {
  const ok = { channelCreatedAt: days(200), subscriptions: 25, likedVideos: 80 };

  it("verifies an established viewer -- no uploads or subscribers needed", () => {
    expect(passesYoutubeViewerCheck(ok, NOW)).toBe(true);
  });

  it("needs all three: 3+ months old, more than 10 subscriptions, 20+ liked videos", () => {
    expect(passesYoutubeViewerCheck({ ...ok, channelCreatedAt: days(60) }, NOW)).toBe(false);
    expect(passesYoutubeViewerCheck({ ...ok, subscriptions: 10 }, NOW)).toBe(false);
    expect(passesYoutubeViewerCheck({ ...ok, subscriptions: 11 }, NOW)).toBe(true);
    expect(passesYoutubeViewerCheck({ ...ok, likedVideos: 19 }, NOW)).toBe(false);
    expect(passesYoutubeViewerCheck({ ...ok, likedVideos: 20 }, NOW)).toBe(true);
  });
});

function tipper(id: string, over: Partial<TipperSignals> = {}): TipperSignals {
  return { senderId: id, accountCreatedAt: days(30), firstTipAt: days(1), verifiedVia: null, ...over };
}

const verdicts = (ts: TipperSignals[]) => Object.fromEntries(classifyTippers(ts).map((c) => [c.senderId, c.verdict]));

describe("tipper breakdown", () => {
  it("counts any verification as real, and everyone else as not verified yet", () => {
    expect(
      verdicts([
        tipper("yt", { verifiedVia: "youtube" }),
        tipper("phone", { verifiedVia: "phone" }),
        tipper("paid", { verifiedVia: "tipped" }),
        tipper("newbie"),
      ])
    ).toEqual({ yt: "real", phone: "real", paid: "real", newbie: "new" });
  });

  it("flags a swarm of accounts that joined right before tipping within 30 minutes", () => {
    const swarm = [0, 5, 12].map((m, i) => tipper(`bot${i}`, { accountCreatedAt: minutes(60 + m), firstTipAt: minutes(m + 20) }));
    const result = classifyTippers([...swarm, tipper("far", { accountCreatedAt: minutes(300), firstTipAt: minutes(290) })]);
    expect(result.map((r) => r.verdict)).toEqual(["suspicious", "suspicious", "suspicious", "new"]);
    expect(result[0].reason).toBe("Joined minutes before tipping, along with 2 other new accounts");
  });

  it("a dollar tipped doesn't clear a swarm account, but a phone or YouTube verification does", () => {
    const ts = [0, 1, 2].map((m, i) =>
      tipper(`s${i}`, {
        accountCreatedAt: minutes(20 + m),
        firstTipAt: minutes(m),
        verifiedVia: i === 0 ? "phone" : i === 1 ? "tipped" : null,
      })
    );
    // s0 is verified, so only s1 and s2 remain fresh: two isn't a swarm.
    expect(verdicts(ts)).toEqual({ s0: "real", s1: "real", s2: "new" });

    const four = [0, 1, 2, 3].map((m, i) =>
      tipper(`f${i}`, { accountCreatedAt: minutes(20 + m), firstTipAt: minutes(m), verifiedVia: i === 0 ? "tipped" : null })
    );
    expect(verdicts(four)).toEqual({ f0: "suspicious", f1: "suspicious", f2: "suspicious", f3: "suspicious" });
  });

  it("adds up the breakdown", () => {
    expect(
      breakdown([
        { senderId: "a", verdict: "real", reason: "" },
        { senderId: "b", verdict: "real", reason: "" },
        { senderId: "c", verdict: "new", reason: "" },
        { senderId: "d", verdict: "suspicious", reason: "" },
      ])
    ).toEqual({ total: 4, real: 2, new: 1, suspicious: 1 });
  });
});

describe("reward drop recipients", () => {
  it("includes verified people and people not on dripp yet; skips unverified and suspicious ones", () => {
    const cases = [
      recipientVerdict(true, "youtube", null),
      recipientVerdict(true, "tipped", null),
      recipientVerdict(false, null, null),
      recipientVerdict(true, null, null),
      recipientVerdict(true, "tipped", "Joined minutes before tipping"),
      recipientVerdict(true, "phone", "Joined minutes before tipping"),
    ];
    expect(cases.map((c) => c.verdict)).toEqual(["verified", "verified", "not_joined", "unverified", "suspicious", "verified"]);
    expect(cases.map((c) => SKIP_BY_DEFAULT.includes(c.verdict))).toEqual([false, false, false, true, true, false]);
  });
});
