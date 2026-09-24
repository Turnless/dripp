import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- fakes for everything the route talks to ---------------------------
const auth = vi.hoisted(() => ({ user: null as null | { id: string; wallet_address: string } }));
const db = vi.hoisted(() => ({
  intent: null as Record<string, unknown> | null,
  intentError: null as unknown,
  rpcResult: { data: "recorded" as unknown, error: null as unknown },
  rpc: vi.fn(),
}));
const chain = vi.hoisted(() => ({ findUsdcTransfers: vi.fn(), findEscrowDeposits: vi.fn() }));

vi.mock("@/lib/privy-server", () => ({ getAuthenticatedUser: async () => auth.user }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/wallet-server", () => chain);
vi.mock("@/lib/supabase", () => ({
  supabaseServer: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: db.intent, error: db.intentError }),
    };
    return {
      from: () => query,
      rpc: async (name: string, args: unknown) => {
        db.rpc(name, args);
        return db.rpcResult;
      },
    };
  },
}));

import { POST } from "@/app/api/tip/confirm/route";

// ---- helpers ------------------------------------------------------------
const TX = "0x" + "AB".repeat(32);
const INTENT_ID = "11111111-1111-4111-8111-111111111111";
const SENDER = { id: "user-a", wallet_address: "0x00000000000000000000000000000000000000a1" };

const directIntent = (extra: Record<string, unknown> = {}) => ({
  id: INTENT_ID,
  kind: "direct",
  sender_wallet: SENDER.wallet_address,
  recipient_wallet: "0x00000000000000000000000000000000000000b2",
  handle_hash: null,
  amount: 0.29,
  tx_hash: null,
  confirmed_at: null,
  ...extra,
});

const confirm = (body: unknown = { intentId: INTENT_ID, txHash: TX }) =>
  POST(
    new Request("http://test/api/tip/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );

beforeEach(() => {
  auth.user = SENDER;
  db.intent = directIntent();
  db.intentError = null;
  db.rpcResult = { data: "recorded", error: null };
  db.rpc.mockReset();
  chain.findUsdcTransfers.mockReset();
  chain.findEscrowDeposits.mockReset();
  chain.findUsdcTransfers.mockResolvedValue({ status: "found", logIndexes: [3, 5], blockNumber: 42n });
});

// ---- tests --------------------------------------------------------------
describe("POST /api/tip/confirm", () => {
  it("401 without a signed-in user", async () => {
    auth.user = null;
    expect((await confirm()).status).toBe(401);
  });

  it("400 for a malformed body", async () => {
    expect((await confirm({ intentId: "nope", txHash: TX })).status).toBe(400);
    expect((await confirm({ intentId: INTENT_ID, txHash: "0x1234" })).status).toBe(400);
  });

  it("404 for an intent that isn't the caller's", async () => {
    db.intent = null;
    expect((await confirm()).status).toBe(404);
    expect(chain.findUsdcTransfers).not.toHaveBeenCalled();
  });

  it("verifies against the saved intent, then records the exact logs", async () => {
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "settled" });

    // $0.29 -> 290000 units, from the intent (not from the request).
    expect(chain.findUsdcTransfers).toHaveBeenCalledWith(
      TX.toLowerCase(),
      SENDER.wallet_address,
      "0x00000000000000000000000000000000000000b2",
      290_000n
    );
    expect(db.rpc).toHaveBeenCalledWith("record_tip", {
      p_intent_id: INTENT_ID,
      p_sender_id: SENDER.id,
      p_tx_hash: TX.toLowerCase(),
      p_log_indexes: [3, 5],
      p_block: 42,
    });
  });

  it("uses the escrow check for escrow intents and answers pending", async () => {
    db.intent = directIntent({
      kind: "escrow",
      recipient_wallet: null,
      handle_hash: "0x1029ba6191fe353fbd48e2ac5794dd816c141703a5787a0cea8294ef4d019d0e",
      amount: 3,
    });
    chain.findEscrowDeposits.mockResolvedValue({ status: "found", logIndexes: [1], blockNumber: 7n });
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "pending" });
    expect(chain.findEscrowDeposits).toHaveBeenCalledWith(
      TX.toLowerCase(),
      SENDER.wallet_address,
      "0x1029ba6191fe353fbd48e2ac5794dd816c141703a5787a0cea8294ef4d019d0e",
      3_000_000n
    );
    expect(chain.findUsdcTransfers).not.toHaveBeenCalled();
  });

  it("202 (ask again) while the node hasn't seen the transaction -- never 'failed'", async () => {
    chain.findUsdcTransfers.mockResolvedValue({ status: "pending" });
    expect((await confirm()).status).toBe(202);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("422 only when the mined transaction doesn't contain the payment", async () => {
    chain.findUsdcTransfers.mockResolvedValue({ status: "missing" });
    expect((await confirm()).status).toBe(422);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("503 (ask again) when the chain can't be read", async () => {
    chain.findUsdcTransfers.mockRejectedValue(new Error("rpc down"));
    expect((await confirm()).status).toBe(503);
  });

  it("is idempotent: replaying the same transaction for a recorded intent is fine", async () => {
    db.intent = directIntent({ confirmed_at: "2026-01-01T00:00:00Z", tx_hash: TX.toLowerCase() });
    const res = await confirm();
    expect(res.status).toBe(200);
    expect(chain.findUsdcTransfers).not.toHaveBeenCalled();
  });

  it("409 when a recorded intent is replayed with a different transaction", async () => {
    db.intent = directIntent({ confirmed_at: "2026-01-01T00:00:00Z", tx_hash: "0x" + "cd".repeat(32) });
    expect((await confirm()).status).toBe(409);
  });

  it.each(["log_used", "intent_used"])("409 when the database says %s", async (outcome) => {
    db.rpcResult = { data: outcome, error: null };
    expect((await confirm()).status).toBe(409);
  });

  it("200 when the database says already_recorded (a racing retry)", async () => {
    db.rpcResult = { data: "already_recorded", error: null };
    expect((await confirm()).status).toBe(200);
  });

  it("503 (ask again) when recording fails", async () => {
    db.rpcResult = { data: null, error: { message: "db down" } };
    expect((await confirm()).status).toBe(503);
  });
});
