import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseServer: () => ({}) }));
vi.mock("@/lib/viewer-verification", () => ({ verificationFor: vi.fn() }));

import { withdrawToAddressBlock } from "@/lib/crypto-access";
import { depositCandidates, unitsToAmount, type IncomingTransfer } from "@/lib/deposits";

describe("withdrawing to a wallet address", () => {
  it("needs the crypto option on and a verified account", () => {
    expect(withdrawToAddressBlock(false, false)).toBe("crypto_off");
    expect(withdrawToAddressBlock(false, true)).toBe("crypto_off");
    expect(withdrawToAddressBlock(true, false)).toBe("unverified");
    expect(withdrawToAddressBlock(true, true)).toBeNull();
  });
});

const ME = "0x00000000000000000000000000000000000000a1";
const OUTSIDE = "0x00000000000000000000000000000000000000e5";
const VAULT = "0x00000000000000000000000000000000000000f6";

const transfer = (over: Partial<IncomingTransfer["args"]> = {}, meta: Partial<IncomingTransfer> = {}): IncomingTransfer => ({
  args: { from: OUTSIDE, to: ME, value: BigInt(5_000_000), ...over },
  transactionHash: "0x" + "ab".repeat(32) as `0x${string}`,
  logIndex: 2,
  blockNumber: BigInt(10),
  ...meta,
});

describe("deposit detection", () => {
  it("records money from outside dripp to a watched wallet", () => {
    const found = depositCandidates([transfer()], new Map([[ME, "user-1"]]), VAULT);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ userId: "user-1", value: BigInt(5_000_000) });
  });

  it("matches the owner whatever the address case", () => {
    const checksummed = ME.replace("a1", "A1") as `0x${string}`;
    expect(depositCandidates([transfer({ to: checksummed })], new Map([[ME, "user-1"]]), VAULT)).toHaveLength(1);
  });

  it("skips escrow payouts, dust, unwatched wallets and unmined logs", () => {
    const watched = new Map([[ME, "user-1"]]);
    expect(depositCandidates([transfer({ from: VAULT })], watched, VAULT)).toHaveLength(0);
    expect(depositCandidates([transfer({ value: BigInt(9_999) })], watched, VAULT)).toHaveLength(0);
    expect(depositCandidates([transfer({ to: OUTSIDE })], watched, VAULT)).toHaveLength(0);
    expect(depositCandidates([transfer({}, { logIndex: null })], watched, VAULT)).toHaveLength(0);
  });

  it("keeps all six decimals of the amount", () => {
    expect(unitsToAmount(BigInt(5_000_000))).toBe("5.000000");
    expect(unitsToAmount(BigInt(12_345_678))).toBe("12.345678");
    expect(unitsToAmount(BigInt(10_000))).toBe("0.010000");
  });
});
