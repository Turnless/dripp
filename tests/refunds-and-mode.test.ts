import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  pending: [] as Array<{ platform: string; platform_username: string; handle_hash: string | null }>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  modeUpdateRows: [] as unknown[],
  refundable: new Map<string, { units: bigint; availableAt: bigint }>(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        eq: chain,
        is: chain,
        not: chain,
        lt: chain,
        update: chain,
        then: (resolve: (v: unknown) => void) =>
          resolve(table === "pending_tips" ? { data: store.pending, error: null } : { data: [], error: null }),
      });
      if (table === "users") {
        (q as { select: unknown }).select = async () => ({ data: store.modeUpdateRows, error: null });
      }
      return q;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      store.rpcCalls.push({ name, args });
      return { data: 1, error: null };
    },
  }),
}));
vi.mock("@/lib/wallet-server", () => ({
  refundableOf: async (key: string) => store.refundable.get(key) ?? { units: 0n, availableAt: 0n },
}));
vi.mock("@/lib/privy-server", () => ({
  getAuthenticatedUser: async () => ({ id: "user-a", wallet_address: "0x00000000000000000000000000000000000000a1" }),
}));

import { dueRefunds, recordRefunds } from "@/lib/escrow-refunds";
import { PATCH } from "@/app/api/me/route";
import { channelKey, handleHash } from "@/lib/tipvault";

const WALLET = "0x00000000000000000000000000000000000000a1";

beforeEach(() => {
  store.pending = [];
  store.rpcCalls = [];
  store.modeUpdateRows = [];
  store.refundable = new Map();
});

describe("automatic refunds", () => {
  it("offers only what the contract says is refundable now, once per escrow key", async () => {
    const chan = channelKey("youtube", "UC1");
    const legacy = handleHash("youtube", "old");
    store.pending = [
      { platform: "youtube", platform_username: "newbie", handle_hash: chan },
      { platform: "youtube", platform_username: "newbie", handle_hash: chan },
      { platform: "youtube", platform_username: "old", handle_hash: null },
      { platform: "youtube", platform_username: "later", handle_hash: channelKey("youtube", "UC2") },
    ];
    const now = BigInt(Math.floor(Date.now() / 1000));
    store.refundable.set(chan, { units: 300_000n, availableAt: now - 10n });
    store.refundable.set(legacy, { units: 200_000n, availableAt: now - 10n });
    // UC2: deposited more recently, not available yet
    store.refundable.set(channelKey("youtube", "UC2"), { units: 100_000n, availableAt: now + 3600n });

    const due = await dueRefunds("user-a", WALLET);
    expect(due).toEqual([
      { key: chan, units: 300_000n, handle: "newbie" },
      { key: legacy, units: 200_000n, handle: "old" },
    ]);
  });

  it("records a refund of an old handle-keyed deposit by its platform/handle", async () => {
    const legacy = handleHash("youtube", "old");
    const chan = channelKey("youtube", "UC1");
    store.pending = [
      { platform: "youtube", platform_username: "old", handle_hash: null },
      { platform: "youtube", platform_username: "newbie", handle_hash: chan },
    ];
    await recordRefunds("user-a", "0xABC", [
      { handleHash: legacy, units: 200_000n, logIndex: 3, blockNumber: 99n },
      { handleHash: chan, units: 300_000n, logIndex: 4, blockNumber: 99n },
    ]);
    expect(store.rpcCalls.map((c) => c.args)).toEqual([
      {
        p_sender_id: "user-a",
        p_tx_hash: "0xabc",
        p_log_index: 3,
        p_block: 99,
        p_handle_hash: legacy,
        p_legacy_platform: "youtube",
        p_legacy_username: "old",
      },
      {
        p_sender_id: "user-a",
        p_tx_hash: "0xabc",
        p_log_index: 4,
        p_block: 99,
        p_handle_hash: chan,
        p_legacy_platform: null,
        p_legacy_username: null,
      },
    ]);
  });
});

describe("viewer/creator mode is chosen once", () => {
  const patch = (mode: string) =>
    PATCH(
      new Request("http://test/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      }) as never
    );

  it("saves the first choice", async () => {
    store.modeUpdateRows = [{ mode: "creator" }];
    const res = await patch("creator");
    expect(res.status).toBe(200);
  });

  it("refuses to change it afterwards", async () => {
    store.modeUpdateRows = []; // the update only matches users with no mode yet
    const res = await patch("viewer");
    expect(res.status).toBe(409);
  });
});
