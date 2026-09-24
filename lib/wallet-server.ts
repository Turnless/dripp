/**
 * Server-side chain helpers: read balances, VERIFY transfers the user's smart
 * wallet already sent, and release escrow (the one transaction the backend
 * signs itself).
 *
 * How sending works (design checked against docs, Sept 2026):
 *   - Users' smart wallets send their own transfers from the browser via
 *     Privy native smart wallets (`@privy-io/react-auth/smart-wallets`,
 *     `useSmartWallets().client.sendTransaction({ calls })`), confirmed in the
 *     installed @privy-io/react-auth@1.99.1 type definitions and
 *     https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview
 *   - Gas is sponsored by the ERC-4337 bundler + paymaster configured for
 *     Monad in the Privy dashboard (custom chain). Currently Pimlico -- see
 *     https://docs.monad.xyz/tooling-and-infra/account-abstraction/infra-providers
 *     for providers that support Monad mainnet. No bundler/paymaster URL or
 *     key lives in this codebase.
 *   - The server never holds user keys. It only checks the resulting
 *     transaction's logs before recording anything, so history can't be faked.
 *
 * *** VERIFY BEFORE USE *** (runtime, not API shape)
 * Sending tips (direct and into escrow) has been exercised end to end on
 * Monad mainnet with this setup. Re-check against the Privy docs above
 * before upgrading @privy-io/react-auth or changing the bundler/paymaster
 * provider. See README "Gas-free transfers setup".
 */

import "server-only";
import {
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbiItem,
  parseEventLogs,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, USDC_ADDRESS, minimalErc20Abi } from "./chain";
import { tipVaultAbi, tipVaultAddress } from "./tipvault";

// Server-side RPC. MONAD_RPC_URL (server-only) wins when set -- use it for an
// RPC URL that carries an API key, which must never reach the browser.
// Otherwise the public NEXT_PUBLIC_MONAD_RPC_URL (the chain default) is used.
const serverTransport = () => http(process.env.MONAD_RPC_URL || undefined);

export const publicClient = createPublicClient({
  chain: monad,
  transport: serverTransport(),
});

const same = (a: string, b: string) => getAddress(a) === getAddress(b);

/**
 * How long to wait for our RPC node to see a transaction the browser says
 * it sent. The smart wallet returns once the transaction is included, but
 * our node can be a block or two behind the bundler's -- "not found yet" is
 * NOT "didn't happen". Kept short so a request never runs into the hosting
 * time limit; the caller asks again.
 */
const RECEIPT_WAIT_MS = 8_000;

export async function getUsdcBalanceUnits(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: minimalErc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/** The receipt, or "pending" if our node still doesn't have it after `waitMs`. */
async function receiptOrPending(txHash: Hash, waitMs: number) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      return await publicClient.getTransactionReceipt({ hash: txHash });
    } catch (err) {
      if (!(err instanceof TransactionReceiptNotFoundError)) throw err;
      if (Date.now() >= deadline) return "pending" as const;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/** False once the node has never heard of `txHash` (dropped, never mined). */
export async function transactionKnown(txHash: Hash): Promise<boolean> {
  try {
    await publicClient.getTransaction({ hash: txHash });
    return true;
  } catch (err) {
    if (err instanceof TransactionNotFoundError) return false;
    throw err;
  }
}

/**
 * Result of looking for an expected log in a transaction:
 *   - pending: our node doesn't have the transaction yet -- ask again later
 *   - missing: it was mined, but doesn't contain the expected log, so the
 *     expected money movement did not happen in it
 *   - found:   the matching logs (usually one), in log order
 */
export type LogMatch =
  | { status: "pending" }
  | { status: "missing" }
  | { status: "found"; logIndexes: number[]; blockNumber: bigint };

/** Logs in `txHash` that moved exactly `units` USDC from `from` to `to`. */
export async function findUsdcTransfers(
  txHash: Hash,
  from: string,
  to: string,
  units: bigint,
  waitMs = RECEIPT_WAIT_MS
): Promise<LogMatch> {
  const receipt = await receiptOrPending(txHash, waitMs);
  if (receipt === "pending") return { status: "pending" };
  if (receipt.status !== "success") return { status: "missing" };
  const transfers = parseEventLogs({
    abi: minimalErc20Abi,
    eventName: "Transfer",
    logs: receipt.logs.filter((l) => same(l.address, USDC_ADDRESS)),
  });
  const logIndexes = transfers
    .filter((t) => same(t.args.from, from) && same(t.args.to, to) && t.args.value === units)
    .map((t) => t.logIndex);
  return logIndexes.length
    ? { status: "found", logIndexes, blockNumber: receipt.blockNumber }
    : { status: "missing" };
}

/** Logs in `txHash` that deposited exactly `units` into TipVault for `hash` from `from`. */
export async function findEscrowDeposits(
  txHash: Hash,
  from: string,
  hash: `0x${string}`,
  units: bigint,
  waitMs = RECEIPT_WAIT_MS
): Promise<LogMatch> {
  const vault = tipVaultAddress();
  if (!vault) throw new Error("TipVault is not configured");
  const receipt = await receiptOrPending(txHash, waitMs);
  if (receipt === "pending") return { status: "pending" };
  if (receipt.status !== "success") return { status: "missing" };
  const deposits = parseEventLogs({
    abi: tipVaultAbi,
    eventName: "PendingTipDeposited",
    logs: receipt.logs.filter((l) => same(l.address, vault)),
  });
  const logIndexes = deposits
    .filter(
      (d) =>
        d.args.handleHash.toLowerCase() === hash.toLowerCase() &&
        same(d.args.sender, from) &&
        d.args.amount === units
    )
    .map((d) => d.logIndex);
  return logIndexes.length
    ? { status: "found", logIndexes, blockNumber: receipt.blockNumber }
    : { status: "missing" };
}

/**
 * Sends TipVault.claim, releasing everything escrowed for `hash` to
 * `recipient`. Signed by the backend-owned TipVault owner key -- only call
 * after OAuth proved the recipient owns the handle. Returns the transaction
 * hash without waiting for it (see readEscrowClaim), or null if nothing is
 * escrowed.
 */
export async function sendEscrowClaim(
  hash: `0x${string}`,
  recipient: `0x${string}`
): Promise<Hash | null> {
  const vault = tipVaultAddress();
  const key = process.env.TIPVAULT_OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!vault || !key) throw new Error("TipVault is not configured");

  const pending = await publicClient.readContract({
    address: vault,
    abi: tipVaultAbi,
    functionName: "pendingBalanceOf",
    args: [hash],
  });
  if (pending === BigInt(0)) return null;

  const wallet = createWalletClient({
    account: privateKeyToAccount(key),
    chain: monad,
    transport: serverTransport(),
  });
  return wallet.writeContract({
    address: vault,
    abi: tipVaultAbi,
    functionName: "claim",
    args: [hash, recipient],
  });
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "failed" }
  | { status: "claimed"; units: bigint; blockNumber: bigint; logIndex: number };

/** What a TipVault.claim transaction for `hash` did, once it's mined. */
export async function readEscrowClaim(
  txHash: Hash,
  hash: `0x${string}`,
  waitMs = RECEIPT_WAIT_MS
): Promise<ClaimResult> {
  const vault = tipVaultAddress();
  if (!vault) throw new Error("TipVault is not configured");
  const receipt = await receiptOrPending(txHash, waitMs);
  if (receipt === "pending") return { status: "pending" };
  if (receipt.status !== "success") return { status: "failed" };
  const claimed = parseEventLogs({
    abi: tipVaultAbi,
    eventName: "PendingTipClaimed",
    logs: receipt.logs.filter((l) => same(l.address, vault)),
  }).find((c) => c.args.handleHash.toLowerCase() === hash.toLowerCase());
  if (!claimed) return { status: "failed" };
  return {
    status: "claimed",
    units: claimed.args.amount,
    blockNumber: receipt.blockNumber,
    logIndex: claimed.logIndex,
  };
}

// ---- Log scans, for the reconcile job (app/api/cron/reconcile) ----------

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);
const depositEvent = parseAbiItem(
  "event PendingTipDeposited(bytes32 indexed handleHash, address indexed sender, uint256 amount)"
);

/** USDC transfers sent by any of `senders` in the block range (inclusive). */
export async function usdcTransfersFrom(
  senders: `0x${string}`[],
  fromBlock: bigint,
  toBlock: bigint
) {
  return publicClient.getLogs({
    address: USDC_ADDRESS,
    event: transferEvent,
    args: { from: senders },
    fromBlock,
    toBlock,
  });
}

/** TipVault deposits in the block range (inclusive). */
export async function escrowDepositsBetween(fromBlock: bigint, toBlock: bigint) {
  const vault = tipVaultAddress();
  if (!vault) return [];
  return publicClient.getLogs({ address: vault, event: depositEvent, fromBlock, toBlock });
}
