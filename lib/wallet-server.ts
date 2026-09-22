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
 *   - Gas is sponsored by the bundler + paymaster configured for Monad in the
 *     Privy dashboard (custom chain; ZeroDev and Pimlico both list Monad
 *     mainnet at https://docs.monad.xyz/tooling-and-infra/account-abstraction/infra-providers).
 *   - The server never holds user keys. It only checks the resulting
 *     transaction's logs before recording anything, so history can't be faked.
 *
 * *** VERIFY BEFORE USE *** (runtime, not API shape)
 * Not yet exercised end to end: needs the Privy dashboard smart-wallet +
 * Monad custom-chain setup, ZeroDev bundler/paymaster URLs, a Monad RPC URL,
 * and a deployed TipVault. See README "Gas-free transfers setup".
 */

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseEventLogs,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, USDC_ADDRESS, minimalErc20Abi } from "./chain";
import { tipVaultAbi, tipVaultAddress } from "./tipvault";

export const publicClient = createPublicClient({
  chain: monad,
  transport: http(),
});

const same = (a: string, b: string) => getAddress(a) === getAddress(b);

export async function getUsdcBalanceUnits(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: minimalErc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function successfulLogs(txHash: Hash) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;
  return receipt.logs;
}

/** True if `txHash` moved exactly `units` USDC from `from` to `to`. */
export async function verifyUsdcTransfer(
  txHash: Hash,
  from: string,
  to: string,
  units: bigint
): Promise<boolean> {
  const logs = await successfulLogs(txHash);
  if (!logs) return false;
  const transfers = parseEventLogs({
    abi: minimalErc20Abi,
    eventName: "Transfer",
    logs: logs.filter((l) => same(l.address, USDC_ADDRESS)),
  });
  return transfers.some(
    (t) => same(t.args.from, from) && same(t.args.to, to) && t.args.value === units
  );
}

/** True if `txHash` deposited exactly `units` into TipVault for `hash` from `from`. */
export async function verifyEscrowDeposit(
  txHash: Hash,
  from: string,
  hash: `0x${string}`,
  units: bigint
): Promise<boolean> {
  const vault = tipVaultAddress();
  if (!vault) return false;
  const logs = await successfulLogs(txHash);
  if (!logs) return false;
  const deposits = parseEventLogs({
    abi: tipVaultAbi,
    eventName: "PendingTipDeposited",
    logs: logs.filter((l) => same(l.address, vault)),
  });
  return deposits.some(
    (d) => d.args.handleHash === hash && same(d.args.sender, from) && d.args.amount === units
  );
}

/**
 * Releases everything escrowed for `hash` to `recipient`. Signed by the
 * backend-owned TipVault owner key -- only call after OAuth proved the
 * recipient owns the handle. Returns the tx hash and amount released, or
 * null if nothing was pending.
 */
export async function releaseEscrow(
  hash: `0x${string}`,
  recipient: `0x${string}`
): Promise<{ txHash: Hash; units: bigint } | null> {
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
    transport: http(),
  });
  const txHash = await wallet.writeContract({
    address: vault,
    abi: tipVaultAbi,
    functionName: "claim",
    args: [hash, recipient],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("Escrow claim failed");
  return { txHash, units: pending };
}
