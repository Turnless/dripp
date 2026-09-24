import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TransactionReceiptNotFoundError,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hash,
} from "viem";
import { USDC_ADDRESS, minimalErc20Abi } from "@/lib/chain";
import { handleHash, tipVaultAbi, tipVaultAddress } from "@/lib/tipvault";
import { findEscrowDeposits, findUsdcTransfers, publicClient, readEscrowClaim } from "@/lib/wallet-server";

const TX = ("0x" + "ab".repeat(32)) as Hash;
const SENDER = "0x00000000000000000000000000000000000000a1";
const RECIPIENT = "0x00000000000000000000000000000000000000b2";
const OTHER = "0x00000000000000000000000000000000000000c3";
const FAKE_TOKEN = "0x00000000000000000000000000000000000000dd";
const VAULT = tipVaultAddress()!;
const HANDLE = handleHash("youtube", "somecreator");

const transferLog = (from: string, to: string, value: bigint, logIndex: number, address: string = USDC_ADDRESS) => ({
  address,
  topics: encodeEventTopics({
    abi: minimalErc20Abi,
    eventName: "Transfer",
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  }),
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex,
  blockNumber: 100n,
  transactionHash: TX,
});

const vaultLog = (
  eventName: "PendingTipDeposited" | "PendingTipClaimed",
  hash: `0x${string}`,
  who: string,
  amount: bigint,
  logIndex: number,
  address: string = VAULT
) => ({
  address,
  topics: encodeEventTopics({
    abi: tipVaultAbi,
    eventName,
    args:
      eventName === "PendingTipDeposited"
        ? { handleHash: hash, sender: who as `0x${string}` }
        : { handleHash: hash, recipient: who as `0x${string}` },
  } as never),
  data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  logIndex,
  blockNumber: 100n,
  transactionHash: TX,
});

function receipt(logs: unknown[], status: "success" | "reverted" = "success") {
  vi.spyOn(publicClient, "getTransactionReceipt").mockResolvedValue({
    status,
    blockNumber: 100n,
    logs,
  } as never);
}

afterEach(() => vi.restoreAllMocks());

describe("findUsdcTransfers", () => {
  it("finds the exact transfer and reports its log index and block", async () => {
    receipt([transferLog(SENDER, RECIPIENT, 150_000n, 4)]);
    expect(await findUsdcTransfers(TX, SENDER, RECIPIENT, 150_000n)).toEqual({
      status: "found",
      logIndexes: [4],
      blockNumber: 100n,
    });
  });

  it("matches addresses regardless of letter case", async () => {
    receipt([transferLog(SENDER, RECIPIENT, 1n, 0)]);
    const r = await findUsdcTransfers(TX, getAddress(SENDER), RECIPIENT.toUpperCase().replace("0X", "0x"), 1n);
    expect(r.status).toBe("found");
  });

  it.each([
    ["wrong sender", OTHER, RECIPIENT, 150_000n],
    ["wrong recipient", SENDER, OTHER, 150_000n],
    ["wrong amount", SENDER, RECIPIENT, 150_001n],
  ])("is missing with the %s", async (_name, from, to, units) => {
    receipt([transferLog(SENDER, RECIPIENT, 150_000n, 4)]);
    expect((await findUsdcTransfers(TX, from, to, units)).status).toBe("missing");
  });

  it("ignores an identical Transfer event from another token contract", async () => {
    receipt([transferLog(SENDER, RECIPIENT, 150_000n, 4, FAKE_TOKEN)]);
    expect((await findUsdcTransfers(TX, SENDER, RECIPIENT, 150_000n)).status).toBe("missing");
  });

  it("treats a reverted transaction as missing", async () => {
    receipt([transferLog(SENDER, RECIPIENT, 150_000n, 4)], "reverted");
    expect((await findUsdcTransfers(TX, SENDER, RECIPIENT, 150_000n)).status).toBe("missing");
  });

  it("returns every matching log (two identical tips in one transaction)", async () => {
    receipt([
      transferLog(SENDER, RECIPIENT, 150_000n, 2),
      transferLog(OTHER, RECIPIENT, 150_000n, 3),
      transferLog(SENDER, RECIPIENT, 150_000n, 5),
    ]);
    const r = await findUsdcTransfers(TX, SENDER, RECIPIENT, 150_000n);
    expect(r).toMatchObject({ status: "found", logIndexes: [2, 5] });
  });

  it("says pending -- not missing -- while the node hasn't seen the transaction", async () => {
    vi.spyOn(publicClient, "getTransactionReceipt").mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: TX })
    );
    expect((await findUsdcTransfers(TX, SENDER, RECIPIENT, 1n, 0)).status).toBe("pending");
  });

  it("surfaces other RPC errors instead of guessing", async () => {
    vi.spyOn(publicClient, "getTransactionReceipt").mockRejectedValue(new Error("rpc down"));
    await expect(findUsdcTransfers(TX, SENDER, RECIPIENT, 1n, 0)).rejects.toThrow("rpc down");
  });
});

describe("findEscrowDeposits", () => {
  it("finds the deposit for the handle", async () => {
    receipt([
      transferLog(SENDER, VAULT, 300_000n, 0),
      vaultLog("PendingTipDeposited", HANDLE, SENDER, 300_000n, 1),
    ]);
    expect(await findEscrowDeposits(TX, SENDER, HANDLE, 300_000n)).toMatchObject({
      status: "found",
      logIndexes: [1],
    });
  });

  it("is missing for another handle, sender or amount, or a look-alike contract", async () => {
    receipt([vaultLog("PendingTipDeposited", HANDLE, SENDER, 300_000n, 1)]);
    expect((await findEscrowDeposits(TX, SENDER, handleHash("youtube", "other"), 300_000n)).status).toBe("missing");
    expect((await findEscrowDeposits(TX, OTHER, HANDLE, 300_000n)).status).toBe("missing");
    expect((await findEscrowDeposits(TX, SENDER, HANDLE, 1n)).status).toBe("missing");

    receipt([vaultLog("PendingTipDeposited", HANDLE, SENDER, 300_000n, 1, FAKE_TOKEN)]);
    expect((await findEscrowDeposits(TX, SENDER, HANDLE, 300_000n)).status).toBe("missing");
  });

  it("a deposit's USDC transfer into the vault is not a direct tip", async () => {
    receipt([
      transferLog(SENDER, VAULT, 300_000n, 0),
      vaultLog("PendingTipDeposited", HANDLE, SENDER, 300_000n, 1),
    ]);
    expect((await findUsdcTransfers(TX, SENDER, RECIPIENT, 300_000n)).status).toBe("missing");
  });
});

describe("readEscrowClaim", () => {
  it("reads the amount and position of the claim for the handle", async () => {
    receipt([vaultLog("PendingTipClaimed", HANDLE, RECIPIENT, 500_000n, 7)]);
    expect(await readEscrowClaim(TX, HANDLE, 0)).toEqual({
      status: "claimed",
      units: 500_000n,
      blockNumber: 100n,
      logIndex: 7,
    });
  });

  it("fails for a reverted claim or one for another handle", async () => {
    receipt([vaultLog("PendingTipClaimed", HANDLE, RECIPIENT, 500_000n, 7)], "reverted");
    expect((await readEscrowClaim(TX, HANDLE, 0)).status).toBe("failed");
    receipt([vaultLog("PendingTipClaimed", HANDLE, RECIPIENT, 500_000n, 7)]);
    expect((await readEscrowClaim(TX, handleHash("kick", "x"), 0)).status).toBe("failed");
  });
});
