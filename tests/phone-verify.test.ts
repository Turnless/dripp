import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  verified: false,
  usedByOther: false,
  limitRefusal: null as Response | null,
  recordOutcome: "recorded" as "recorded" | "taken",
  recorded: [] as string[],
  twilio: [] as { url: string; body: string }[],
  twilioReply: { status: 201, json: {} as Record<string, unknown> },
}));

vi.mock("@/lib/privy-server", () => ({
  getAuthenticatedUser: async () => ({ id: "u1", wallet_address: "0x1" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  phoneVerifyLimit: async () => state.limitRefusal,
  rateLimit: async () => null,
}));
vi.mock("@/lib/viewer-verification", () => ({
  verificationFor: async () => (state.verified ? { verified: true, via: "youtube" } : { verified: false, via: null }),
  phoneUsedByOther: async () => state.usedByOther,
  recordPhoneVerification: async (_u: string, hash: string) => {
    state.recorded.push(hash);
    if (state.recordOutcome === "recorded") state.verified = true;
    return state.recordOutcome;
  },
}));

import { normalizePhone, phoneHash } from "@/lib/phone-verify";
import { POST as start } from "@/app/api/me/verify/start/route";
import { POST as check } from "@/app/api/me/verify/check/route";

const call = (handler: (r: never) => Promise<Response>, body: unknown) =>
  handler(
    new Request("http://test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );

beforeEach(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_VERIFY_SERVICE_SID: "VA123",
    PHONE_HASH_SECRET: "a-long-test-secret-value",
  });
  Object.assign(state, {
    verified: false,
    usedByOther: false,
    limitRefusal: null,
    recordOutcome: "recorded",
    recorded: [],
    twilio: [],
    twilioReply: { status: 201, json: {} },
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    state.twilio.push({ url, body: String(init.body) });
    return new Response(JSON.stringify(state.twilioReply.json), { status: state.twilioReply.status });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("phone numbers", () => {
  it("normalizes to international form and rejects junk", () => {
    expect(normalizePhone("+234 801-234 5678")).toBe("+2348012345678");
    expect(normalizePhone("0044 (7700) 900123")).toBe("+447700900123");
    expect(normalizePhone("08012345678")).toBeNull(); // no country code
    expect(normalizePhone("+0 123 4567 89")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
  });

  it("stores a keyed hash, never the number, and the same number always hashes the same", () => {
    const h = phoneHash("+447700900123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("447700900123");
    expect(phoneHash("+447700900123")).toBe(h);
    expect(phoneHash("+447700900124")).not.toBe(h);
  });
});

describe("sending a code", () => {
  it("sends by the chosen channel to the normalized number", async () => {
    const res = await call(start, { phone: "+44 7700 900123", channel: "whatsapp" });
    expect(res.status).toBe(200);
    expect(state.twilio).toHaveLength(1);
    expect(state.twilio[0].url).toBe("https://verify.twilio.com/v2/Services/VA123/Verifications");
    expect(new URLSearchParams(state.twilio[0].body).get("To")).toBe("+447700900123");
    expect(new URLSearchParams(state.twilio[0].body).get("Channel")).toBe("whatsapp");
  });

  it("sends nothing when the limits refuse", async () => {
    state.limitRefusal = new Response(JSON.stringify({ error: "Please wait" }), { status: 429 });
    expect((await call(start, { phone: "+447700900123", channel: "sms" })).status).toBe(429);
    expect(state.twilio).toHaveLength(0);
  });

  it("sends nothing to someone already verified, a bad number, or a number verifying another account", async () => {
    expect((await call(start, { phone: "07700900123", channel: "sms" })).status).toBe(400);
    state.usedByOther = true;
    expect((await call(start, { phone: "+447700900123", channel: "sms" })).status).toBe(409);
    state.usedByOther = false;
    state.verified = true;
    expect((await call(start, { phone: "+447700900123", channel: "sms" })).status).toBe(409);
    expect(state.twilio).toHaveLength(0);
  });

  it("is off until Twilio is configured", async () => {
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    expect((await call(start, { phone: "+447700900123", channel: "sms" })).status).toBe(503);
    expect(state.twilio).toHaveLength(0);
  });
});

describe("checking a code", () => {
  it("verifies on a right code and stores only the hash", async () => {
    state.twilioReply = { status: 200, json: { status: "approved" } };
    const res = await call(check, { phone: "+447700900123", code: "123456" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verification: { verified: true, via: "youtube" } });
    expect(state.recorded).toEqual([phoneHash("+447700900123")]);
  });

  it("rejects a wrong code and an expired one without recording anything", async () => {
    state.twilioReply = { status: 200, json: { status: "pending" } };
    expect((await call(check, { phone: "+447700900123", code: "000000" })).status).toBe(400);
    state.twilioReply = { status: 404, json: { code: 20404 } };
    const expired = await call(check, { phone: "+447700900123", code: "123456" });
    expect(expired.status).toBe(400);
    expect((await expired.json()).error).toMatch(/expired/);
    expect(state.recorded).toEqual([]);
  });

  it("refuses when another account verified the same number first", async () => {
    state.twilioReply = { status: 200, json: { status: "approved" } };
    state.recordOutcome = "taken";
    expect((await call(check, { phone: "+447700900123", code: "123456" })).status).toBe(409);
  });
});
