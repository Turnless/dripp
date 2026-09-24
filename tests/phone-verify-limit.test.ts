import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { p_keys: string[]; p_limits: number[]; p_window_seconds: number }[],
  answers: [] as { data: boolean | null; error: unknown }[],
}));

vi.mock("@/lib/supabase", () => ({
  supabaseServer: () => ({
    rpc: async (_name: string, args: { p_keys: string[]; p_limits: number[]; p_window_seconds: number }) => {
      db.calls.push(args);
      return db.answers.shift() ?? { data: true, error: null };
    },
  }),
}));

import { phoneVerifyLimit } from "@/lib/rate-limit";

const req = () => new Request("http://test/api/me/verify/start", { headers: { "x-forwarded-for": "1.2.3.4" } });

beforeEach(() => {
  db.calls = [];
  db.answers = [];
  delete process.env.PHONE_VERIFY_DAILY_CAP;
});

describe("phone verification limits", () => {
  it("allows one attempt per 5 minutes, then 3 a day per person, 10 per network, 100 in total", async () => {
    expect(await phoneVerifyLimit(req(), "u1")).toBeNull();
    expect(db.calls).toEqual([
      { p_keys: ["phoneVerify5m:u:u1"], p_limits: [1], p_window_seconds: 300 },
      {
        p_keys: ["phoneVerifyDay:u:u1", "phoneVerifyDay:all", "phoneVerifyDay:ip:1.2.3.4"],
        p_limits: [3, 100, 10],
        p_window_seconds: 86400,
      },
    ]);
  });

  it("refuses within 5 minutes without using up a daily attempt", async () => {
    db.answers = [{ data: false, error: null }];
    const res = await phoneVerifyLimit(req(), "u1");
    expect(res?.status).toBe(429);
    expect(db.calls).toHaveLength(1);
  });

  it("refuses once a daily limit is reached", async () => {
    db.answers = [
      { data: true, error: null },
      { data: false, error: null },
    ];
    const res = await phoneVerifyLimit(req(), "u1");
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toMatch(/today's limit/);
  });

  it("fails closed: no code is sent if the limiter can't be reached", async () => {
    db.answers = [{ data: null, error: new Error("db down") }];
    expect((await phoneVerifyLimit(req(), "u1"))?.status).toBe(503);
  });

  it("uses PHONE_VERIFY_DAILY_CAP for the total when set", async () => {
    process.env.PHONE_VERIFY_DAILY_CAP = "25";
    await phoneVerifyLimit(req(), "u1");
    expect(db.calls[1].p_limits).toEqual([3, 25, 10]);
  });
});
