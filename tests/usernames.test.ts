import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  users: [] as Array<{ id: string; username: string; wallet_address: string }>,
  holds: [] as Array<{ username: string; user_id: string; held_until: string; users: { wallet_address: string } }>,
}));

vi.mock("@/lib/youtube", () => ({ lookupYoutubeHandle: vi.fn() }));
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
          const rows = table === "users" ? store.users : table === "username_holds" ? store.holds : [];
          const row = rows.find((r) => r.username === filters.username);
          return { data: row ?? null, error: null };
        },
      };
      return q;
    },
  }),
}));

import { checkUsername, suggestUsername } from "@/lib/usernames";
import { resolveRecipient } from "@/lib/username-resolve";

const WALLET_A = "0x00000000000000000000000000000000000000a1";
const WALLET_B = "0x00000000000000000000000000000000000000b2";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  store.users = [];
  store.holds = [];
});

describe("checkUsername", () => {
  it("normalizes what people type", () => {
    expect(checkUsername("  @Maya.O_1 ")).toEqual({ ok: true, username: "maya.o_1" });
  });

  it("rejects bad lengths and characters", () => {
    expect(checkUsername("ab").ok).toBe(false);
    expect(checkUsername("a".repeat(21)).ok).toBe(false);
    expect(checkUsername("maya-o").ok).toBe(false);
    expect(checkUsername("maya o").ok).toBe(false);
  });

  it("rejects leading, trailing and doubled separators", () => {
    for (const bad of ["_maya", "maya.", "ma..ya", "ma._ya"]) expect(checkUsername(bad).ok).toBe(false);
  });

  it("keeps reserved names and dripp look-alikes free", () => {
    for (const bad of ["admin", "support", "dripp", "dripp_team", "DrippOfficial"]) {
      expect(checkUsername(bad).ok).toBe(false);
    }
  });
});

describe("suggestUsername", () => {
  it("builds a valid name from a display name", () => {
    expect(suggestUsername("Maya O'Neil")).toBe("mayaoneil");
    expect(suggestUsername("José Álvarez")).toBe("josealvarez");
  });

  it("suggests nothing when the name can't make a valid username", () => {
    expect(suggestUsername("Jo")).toBe("");
    expect(suggestUsername(null)).toBe("");
    expect(suggestUsername("Dripp Support")).toBe("");
  });
});

describe("tipping a dripp username", () => {
  it("goes straight to the user who has it", async () => {
    store.users = [{ id: "u1", username: "maya", wallet_address: WALLET_A }];
    expect(await resolveRecipient("dripp", "@Maya")).toEqual({
      status: "existing_user",
      userId: "u1",
      walletAddress: WALLET_A,
    });
  });

  it("reaches the previous owner while an old name is held", async () => {
    store.holds = [
      { username: "oldname", user_id: "u2", held_until: new Date(Date.now() + DAY).toISOString(), users: { wallet_address: WALLET_B } },
    ];
    expect(await resolveRecipient("dripp", "oldname")).toMatchObject({ status: "existing_user", userId: "u2" });
  });

  it("finds nobody once the hold has ended, or for an unknown name", async () => {
    store.holds = [
      { username: "oldname", user_id: "u2", held_until: new Date(Date.now() - DAY).toISOString(), users: { wallet_address: WALLET_B } },
    ];
    expect(await resolveRecipient("dripp", "oldname")).toEqual({ status: "not_found" });
    expect(await resolveRecipient("dripp", "nobody")).toEqual({ status: "not_found" });
  });
});
