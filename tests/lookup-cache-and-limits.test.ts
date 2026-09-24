import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  link: null as unknown,
  cached: null as null | { found: boolean; checked_at: string },
  upserts: [] as unknown[],
  rpc: { data: true as unknown, error: null as unknown },
  rpcArgs: [] as unknown[],
}));
const youtube = vi.hoisted(() => ({ lookupYoutubeHandle: vi.fn() }));

vi.mock("@/lib/youtube", () => youtube);
vi.mock("@/lib/kick", () => ({ lookupKickUsername: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === "platform_links" ? store.link : store.cached,
          error: null,
        }),
        upsert: async (row: unknown) => {
          store.upserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
    rpc: async (_name: string, args: unknown) => {
      store.rpcArgs.push(args);
      return store.rpc;
    },
  }),
}));

import { resolveRecipient } from "@/lib/username-resolve";
import { rateLimit } from "@/lib/rate-limit";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60 * 1000;

beforeEach(() => {
  store.link = null;
  store.cached = null;
  store.upserts = [];
  store.rpc = { data: true, error: null };
  store.rpcArgs = [];
  youtube.lookupYoutubeHandle.mockReset();
});

describe("handle lookup cache", () => {
  it("uses a fresh positive result without calling the platform", async () => {
    store.cached = { found: true, checked_at: ago(60 * MIN) };
    expect((await resolveRecipient("youtube", "@SomeOne")).status).toBe("verified_unclaimed");
    expect(youtube.lookupYoutubeHandle).not.toHaveBeenCalled();
  });

  it("uses a fresh negative result, but only for 10 minutes", async () => {
    store.cached = { found: false, checked_at: ago(5 * MIN) };
    expect((await resolveRecipient("youtube", "someone")).status).toBe("not_found");
    expect(youtube.lookupYoutubeHandle).not.toHaveBeenCalled();

    store.cached = { found: false, checked_at: ago(11 * MIN) };
    youtube.lookupYoutubeHandle.mockResolvedValue({ channelId: "UC1", title: "x", subscriberCount: 1 });
    expect((await resolveRecipient("youtube", "someone")).status).toBe("verified_unclaimed");
  });

  it("looks up and caches when there's nothing fresh", async () => {
    youtube.lookupYoutubeHandle.mockResolvedValue({ channelId: "UC1", title: "x", subscriberCount: 1 });
    await resolveRecipient("youtube", "@SomeOne");
    expect(youtube.lookupYoutubeHandle).toHaveBeenCalledWith("someone");
    expect(store.upserts).toEqual([
      expect.objectContaining({ platform: "youtube", platform_username: "someone", found: true, channel_id: "UC1" }),
    ]);
  });

  it("keeps working on a handle seen before when the platform API fails (quota)", async () => {
    store.cached = { found: true, checked_at: ago(3 * 24 * 60 * MIN) };
    youtube.lookupYoutubeHandle.mockRejectedValue(new Error("quotaExceeded"));
    expect((await resolveRecipient("youtube", "someone")).status).toBe("verified_unclaimed");
  });

  it("surfaces the API failure for a handle never seen before", async () => {
    youtube.lookupYoutubeHandle.mockRejectedValue(new Error("quotaExceeded"));
    await expect(resolveRecipient("youtube", "someone")).rejects.toThrow("quotaExceeded");
  });

  it("never calls the platform for a handle linked on dripp", async () => {
    store.link = { user_id: "u1", users: { wallet_address: "0x00000000000000000000000000000000000000b2" } };
    expect((await resolveRecipient("youtube", "someone")).status).toBe("existing_user");
    expect(youtube.lookupYoutubeHandle).not.toHaveBeenCalled();
  });
});

describe("rateLimit", () => {
  const req = (ip?: string) =>
    new Request("http://test/api/x", { headers: ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {} });

  it("allows when under the limit, counting the user and the client IP", async () => {
    expect(await rateLimit(req("203.0.113.9"), "tipPrepare", "user-a")).toBeNull();
    expect(store.rpcArgs[0]).toEqual({
      p_keys: ["tipPrepare:u:user-a", "tipPrepare:ip:203.0.113.9"],
      p_limits: [60, 300],
      p_window_seconds: 60,
    });
  });

  it("answers 429 when over", async () => {
    store.rpc = { data: false, error: null };
    const res = await rateLimit(req(), "resolve", "user-a");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("60");
  });

  it("fails open if the limiter itself is unavailable", async () => {
    store.rpc = { data: null, error: { message: "db down" } };
    expect(await rateLimit(req(), "tipConfirm", "user-a")).toBeNull();
  });
});
