import { describe, expect, it } from "vitest";
import { breakdown, classifyChannel, classifyTippers, type TipperSignals } from "@/lib/bot-check";

const NOW = new Date("2026-09-24T12:00:00Z");
const minutes = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);
const days = (d: number) => minutes(d * 24 * 60);

function tipper(id: string, over: Partial<TipperSignals> = {}): TipperSignals {
  return {
    senderId: id,
    accountCreatedAt: days(30),
    hasVerifiedChannel: false,
    firstTipAt: days(1),
    recipientsCount: 1,
    activeDays: 1,
    ...over,
  };
}

const verdicts = (ts: TipperSignals[]) =>
  Object.fromEntries(classifyTippers(ts, NOW).map((c) => [c.senderId, c.verdict]));

describe("tipper breakdown", () => {
  it("counts verified channels and established accounts with history as real", () => {
    expect(
      verdicts([
        tipper("verified", { accountCreatedAt: minutes(5), firstTipAt: minutes(1), hasVerifiedChannel: true }),
        tipper("regular", { recipientsCount: 3 }),
        tipper("returning", { activeDays: 2 }),
      ])
    ).toEqual({ verified: "real", regular: "real", returning: "real" });
  });

  it("calls a genuine newcomer 'new', not suspicious", () => {
    expect(verdicts([tipper("newbie", { accountCreatedAt: minutes(30), firstTipAt: minutes(10) })])).toEqual({
      newbie: "new",
    });
    // Old account, but it only ever tipped once: not enough history.
    expect(verdicts([tipper("once")])).toEqual({ once: "new" });
  });

  it("flags a swarm of accounts that joined right before tipping within 30 minutes", () => {
    const swarm = [0, 5, 12].map((m, i) =>
      tipper(`bot${i}`, { accountCreatedAt: minutes(60 + m), firstTipAt: minutes(m + 20) })
    );
    const result = classifyTippers(
      [...swarm, tipper("far", { accountCreatedAt: minutes(300), firstTipAt: minutes(290) })],
      NOW
    );
    expect(result.map((r) => r.verdict)).toEqual(["suspicious", "suspicious", "suspicious", "new"]);
    expect(result[0].reason).toBe("Joined minutes before tipping, along with 2 other new accounts");
  });

  it("needs at least three fresh accounts together to call it a swarm", () => {
    const pair = [0, 5].map((m, i) => tipper(`p${i}`, { accountCreatedAt: minutes(30 + m), firstTipAt: minutes(m) }));
    expect(classifyTippers(pair, NOW).every((r) => r.verdict === "new")).toBe(true);
  });

  it("never flags a verified channel, even inside a swarm", () => {
    const ts = [0, 1, 2].map((m, i) =>
      tipper(`s${i}`, { accountCreatedAt: minutes(20 + m), firstTipAt: minutes(m), hasVerifiedChannel: i === 0 })
    );
    expect(verdicts(ts)).toEqual({ s0: "real", s1: "new", s2: "new" });
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

describe("reward drop channel check", () => {
  it("flags a brand-new channel with no videos and almost no subscribers", () => {
    expect(classifyChannel({ publishedAt: days(3), videoCount: 0, subscriberCount: 0 }, NOW)).toEqual({
      verdict: "suspicious",
      reason: "Channel is 3 days old with no videos",
    });
    expect(classifyChannel({ publishedAt: minutes(30), videoCount: 0, subscriberCount: null }, NOW)).toEqual({
      verdict: "suspicious",
      reason: "Channel is less than a day old with no videos",
    });
  });

  it("leaves ordinary viewers alone: old channels, or new ones with videos or followers", () => {
    expect(classifyChannel({ publishedAt: days(400), videoCount: 0, subscriberCount: 0 }, NOW).verdict).toBe("ok");
    expect(classifyChannel({ publishedAt: days(5), videoCount: 2, subscriberCount: 0 }, NOW).verdict).toBe("ok");
    expect(classifyChannel({ publishedAt: days(5), videoCount: 0, subscriberCount: 40 }, NOW).verdict).toBe("ok");
  });
});
