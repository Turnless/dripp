import { afterEach, describe, expect, it, vi } from "vitest";
import { signState, verifyState } from "@/lib/oauth";

const decode = (state: string) => JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");

describe("platform-link OAuth state", () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env.OAUTH_STATE_SECRET = "test-secret-that-is-at-least-32-characters-long";
  });

  it("round-trips the user id with the matching browser cookie", () => {
    const { state, nonce } = signState("user-1");
    expect(verifyState(state, nonce)).toEqual({ userId: "user-1" });
  });

  it("rejects a missing or different cookie (link started in another browser)", () => {
    const { state } = signState("user-1");
    const other = signState("user-1").nonce;
    expect(verifyState(state, undefined)).toBeNull();
    expect(verifyState(state, other)).toBeNull();
  });

  it("rejects a state whose user id was changed", () => {
    const { state, nonce } = signState("user-1");
    const { payload, sig } = decode(state);
    const tampered = encode({ payload: payload.replace("user-1", "user-2"), sig });
    expect(verifyState(tampered, nonce)).toBeNull();
  });

  it("rejects a forged signature", () => {
    const { state, nonce } = signState("user-1");
    const { payload } = decode(state);
    expect(verifyState(encode({ payload, sig: "00".repeat(32) }), nonce)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyState("not-a-state", "x")).toBeNull();
    expect(verifyState(encode({ payload: 1, sig: 2 }), "x")).toBeNull();
  });

  it("expires after 10 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { state, nonce } = signState("user-1");
    vi.setSystemTime(new Date("2026-01-01T00:09:59Z"));
    expect(verifyState(state, nonce)).toEqual({ userId: "user-1" });
    vi.setSystemTime(new Date("2026-01-01T00:10:01Z"));
    expect(verifyState(state, nonce)).toBeNull();
  });

  it("refuses to sign with a missing or placeholder secret", () => {
    process.env.OAUTH_STATE_SECRET = "";
    expect(() => signState("user-1")).toThrow();
    process.env.OAUTH_STATE_SECRET = "change-me-to-a-random-string";
    expect(() => signState("user-1")).toThrow();
  });
});
