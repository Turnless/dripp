import { describe, expect, it } from "vitest";
import { centsToUnits, unitsToCents, USDC_DECIMALS } from "@/lib/chain";
import { parseUsdToCents } from "@/lib/format";
import { withdrawalFee } from "@/lib/fees";
import { TipSchema } from "@/lib/tip-plan";
import { channelKey, handleHash } from "@/lib/tipvault";
import { normalizeHandle } from "@/lib/username-resolve";

describe("USDC units", () => {
  it("has 6 decimals", () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it("converts cents to base units exactly", () => {
    expect(centsToUnits(1)).toBe(10_000n);
    expect(centsToUnits(29)).toBe(290_000n);
    expect(centsToUnits(100_000)).toBe(1_000_000_000n); // $1,000.00
  });

  it("round-trips cents", () => {
    for (const cents of [0, 1, 29, 57, 99, 100, 12_345, 100_000]) {
      expect(unitsToCents(centsToUnits(cents))).toBe(cents);
    }
  });

  it("rounds sub-cent dust down, never up", () => {
    expect(unitsToCents(1_234_567n)).toBe(123); // $1.234567 shows as $1.23
    expect(unitsToCents(9_999n)).toBe(0);
  });

  it("matches what the UI sends for classic float-trouble amounts", () => {
    // The UI sends cents / 100; the server rounds back to whole cents.
    for (const cents of [29, 57, 1, 10, 110, 99_999]) {
      const amountUsd = cents / 100;
      expect(centsToUnits(Math.round(amountUsd * 100))).toBe(BigInt(cents) * 10_000n);
    }
  });
});

describe("parseUsdToCents", () => {
  it.each([
    ["5", 500],
    ["5.5", 550],
    ["0.29", 29],
    ["$1,000.00", 100_000],
    [".5", 50],
  ])("parses %s", (input, cents) => {
    expect(parseUsdToCents(input)).toBe(cents);
  });

  it.each(["", ".", "1.234", "abc", "-1"])("rejects %s", (input) => {
    expect(parseUsdToCents(input)).toBeNull();
  });
});

describe("withdrawal fee", () => {
  it("is 1%, rounded, and fee + receive = amount", () => {
    expect(withdrawalFee(5_000)).toEqual({ fee: 50, receive: 4_950 });
    expect(withdrawalFee(149)).toEqual({ fee: 1, receive: 148 });
    for (const cents of [1, 49, 50, 99, 12_345]) {
      const { fee, receive } = withdrawalFee(cents);
      expect(fee + receive).toBe(cents);
    }
  });
});

describe("TipSchema amounts", () => {
  const base = { platform: "youtube" as const, toUsername: "someone" };
  it.each([0.01, 0.29, 0.57, 1, 999.99, 1000])("accepts %s", (amountUsd) => {
    expect(TipSchema.safeParse({ ...base, amountUsd }).success).toBe(true);
  });
  it.each([0, -1, 0.001, 1.005, 1000.01])("rejects %s", (amountUsd) => {
    expect(TipSchema.safeParse({ ...base, amountUsd }).success).toBe(false);
  });
});

describe("handleHash", () => {
  // Same values are asserted in contracts/test/TipVault.t.sol
  // (keccak256(abi.encodePacked(platform, ":", handle))).
  it("matches the Solidity escrow key", () => {
    expect(handleHash("youtube", "somecreator")).toBe(
      "0x1029ba6191fe353fbd48e2ac5794dd816c141703a5787a0cea8294ef4d019d0e"
    );
    expect(handleHash("kick", "somecreator")).toBe(
      "0xf86f51406bb7248862de01f466579977b833670b4868262be47c0d68e6be54a4"
    );
  });

  it("matches the Solidity channel key, and never equals a handle key", () => {
    expect(channelKey("youtube", "UCabc123")).toBe(
      "0x28665104ac78382eafc46f9456552d248ade2338c7f3d48969aabc6582449b53"
    );
    expect(channelKey("youtube", "somecreator")).not.toBe(handleHash("youtube", "somecreator"));
  });

  it("is the same for every spelling of a handle after normalizing", () => {
    const expected = handleHash("youtube", "somecreator");
    for (const raw of ["@SomeCreator", "somecreator", "  @somecreator ", "SOMECREATOR"]) {
      expect(handleHash("youtube", normalizeHandle(raw))).toBe(expected);
    }
  });
});
