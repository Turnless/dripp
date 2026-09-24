import { beforeEach, describe, expect, it, vi } from "vitest";

type Link = { user_id: string; channel_id: string | null; users: { wallet_address: string } };

const store = vi.hoisted(() => ({
  links: [] as Array<Link & { platform_username: string }>,
  cached: null as null | { found: boolean; channel_id: string | null; checked_at: string },
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
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => {
          if (table === "handle_lookups") return { data: store.cached, error: null };
          const row = store.links.find((l) =>
            "channel_id" in filters ? l.channel_id === filters.channel_id : l.platform_username === filters.platform_username
          );
          return { data: row ?? null, error: null };
        },
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
const WALLET_B = "0x00000000000000000000000000000000000000b2";
const WALLET_C = "0x00000000000000000000000000000000000000c3";
const found = (channelId: string) => ({ channelId, title: "x", subscriberCount: 1 });

beforeEach(() => {
  store.links = [];
  store.cached = null;
  store.upserts = [];
  store.rpc = { data: true, error: null };
  store.rpcArgs = [];
  youtube.lookupYoutubeHandle.mockReset();
});

describe("handle lookup cache", () => {
  it("uses a fresh positive result without calling the platform", async () => {
    store.cached = { found: true, channel_id: "UC1", checked_at: ago(60 * MIN) };
    expect(await resolveRecipient("youtube", "@SomeOne")).toEqual({
      status: "verified_unclaimed",
      platform: "youtube",
      platformUsername: "someone",
      channelId: "UC1",
    });
    expect(youtube.lookupYoutubeHandle).not.toHaveBeenCalled();
  });

  it("looks up again when a cached result has no channel ID", async () => {
    store.cached = { found: true, channel_id: null, checked_at: ago(1 * MIN) };
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC1"));
    expect(await resolveRecipient("youtube", "someone")).toMatchObject({ channelId: "UC1" });
    expect(youtube.lookupYoutubeHandle).toHaveBeenCalledOnce();
  });

  it("uses a fresh negative result, but only for 10 minutes", async () => {
    store.cached = { found: false, channel_id: null, checked_at: ago(5 * MIN) };
    expect((await resolveRecipient("youtube", "someone")).status).toBe("not_found");
    expect(youtube.lookupYoutubeHandle).not.toHaveBeenCalled();

    store.cached = { found: false, channel_id: null, checked_at: ago(11 * MIN) };
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC1"));
    expect((await resolveRecipient("youtube", "someone")).status).toBe("verified_unclaimed");
  });

  it("looks up and caches the channel when there's nothing fresh", async () => {
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC1"));
    await resolveRecipient("youtube", "@SomeOne");
    expect(youtube.lookupYoutubeHandle).toHaveBeenCalledWith("someone");
    expect(store.upserts).toEqual([
      expect.objectContaining({ platform: "youtube", platform_username: "someone", found: true, channel_id: "UC1" }),
    ]);
  });

  it("keeps working on a handle seen before when the platform API fails (quota)", async () => {
    store.cached = { found: true, channel_id: "UC1", checked_at: ago(3 * 24 * 60 * MIN) };
    youtube.lookupYoutubeHandle.mockRejectedValue(new Error("quotaExceeded"));
    expect((await resolveRecipient("youtube", "someone")).status).toBe("verified_unclaimed");
  });

  it("surfaces the API failure for a handle never seen before", async () => {
    youtube.lookupYoutubeHandle.mockRejectedValue(new Error("quotaExceeded"));
    await expect(resolveRecipient("youtube", "someone")).rejects.toThrow("quotaExceeded");
  });
});

describe("channel-ID identity", () => {
  it("pays the linked owner when the handle still belongs to their channel", async () => {
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC_B"));
    expect(await resolveRecipient("youtube", "bee")).toEqual({
      status: "existing_user",
      userId: "B",
      walletAddress: WALLET_B,
    });
  });

  it("follows the channel after a rename: the new handle reaches the same person", async () => {
    // B linked as @bee (channel UC_B), then renamed to @beeline without relinking.
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC_B"));
    expect(await resolveRecipient("youtube", "beeline")).toMatchObject({ status: "existing_user", userId: "B" });
  });

  it("ignores a stale link when the handle now belongs to someone else", async () => {
    // @bee was B's; the handle now belongs to channel UC_NEW, which isn't on dripp.
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC_NEW"));
    expect(await resolveRecipient("youtube", "bee")).toEqual({
      status: "verified_unclaimed",
      platform: "youtube",
      platformUsername: "bee",
      channelId: "UC_NEW",
    });
  });

  it("pays the new owner of a reassigned handle if they're linked", async () => {
    store.links = [
      { platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } },
      { platform_username: "cee", user_id: "C", channel_id: "UC_C", users: { wallet_address: WALLET_C } },
    ];
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC_C"));
    expect(await resolveRecipient("youtube", "bee")).toMatchObject({ status: "existing_user", userId: "C" });
  });

  it("doesn't route to a linked handle that no longer exists on the platform", async () => {
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockResolvedValue(null);
    expect((await resolveRecipient("youtube", "bee")).status).toBe("not_found");
  });

  it("trusts a link from before channel IDs until its owner relinks", async () => {
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: null, users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockResolvedValue(found("UC_B"));
    expect(await resolveRecipient("youtube", "bee")).toMatchObject({ status: "existing_user", userId: "B" });
  });

  it("trusts the linked handle if the platform can't be reached", async () => {
    store.links = [{ platform_username: "bee", user_id: "B", channel_id: "UC_B", users: { wallet_address: WALLET_B } }];
    youtube.lookupYoutubeHandle.mockRejectedValue(new Error("quotaExceeded"));
    expect(await resolveRecipient("youtube", "bee")).toMatchObject({ status: "existing_user", userId: "B" });
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
