import { defineChain } from "viem";

/**
 * Monad mainnet chain definition for viem/wagmi.
 *
 * Chain ID 143 is confirmed (see Aave governance asset assessment for USDC on
 * Monad, referenced in 02-differentiation.md). The RPC and explorer URLs below
 * are read from env vars on purpose -- fill NEXT_PUBLIC_MONAD_RPC_URL with the
 * current endpoint from https://docs.monad.xyz before running this anywhere
 * real. Do not ship a hardcoded guess here.
 */
export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || ""] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || "",
    },
  },
});

// Native, Circle-issued USDC on Monad mainnet -- confirmed live in research.
// Do not substitute USDT0 (LayerZero-bridged, far less liquid) as the default asset.
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
export const USDC_DECIMALS = Number(process.env.NEXT_PUBLIC_USDC_DECIMALS ?? 6);

export const minimalErc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Whole cents -> USDC base units (6 decimals). */
export function centsToUnits(cents: number): bigint {
  return BigInt(Math.round(cents)) * BigInt(10) ** BigInt(USDC_DECIMALS - 2);
}

/** USDC base units -> whole cents (rounded down). */
export function unitsToCents(units: bigint): number {
  return Number(units / BigInt(10) ** BigInt(USDC_DECIMALS - 2));
}
