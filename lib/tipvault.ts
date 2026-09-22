import { encodePacked, keccak256 } from "viem";

/** Deployed TipVault address, or null until contracts/src/TipVault.sol is deployed. */
export function tipVaultAddress(): `0x${string}` | null {
  const a = process.env.TIPVAULT_CONTRACT_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : null;
}

/**
 * Escrow key for a platform handle. Must match TipVault.t.sol:
 *   keccak256(abi.encodePacked(platform, ":", username))
 * `username` must already be normalized (lib/username-resolve.ts normalizeHandle).
 */
export function handleHash(platform: string, username: string): `0x${string}` {
  return keccak256(encodePacked(["string", "string", "string"], [platform, ":", username]));
}

// Only the parts of contracts/src/TipVault.sol the app calls or reads.
export const tipVaultAbi = [
  {
    type: "function",
    name: "depositPending",
    stateMutability: "nonpayable",
    inputs: [
      { name: "handleHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "handleHash", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "handleHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refundableOf",
    stateMutability: "view",
    inputs: [
      { name: "handleHash", type: "bytes32" },
      { name: "sender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "availableAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "PendingTipRefunded",
    inputs: [
      { name: "handleHash", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "pendingBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "handleHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "PendingTipDeposited",
    inputs: [
      { name: "handleHash", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PendingTipClaimed",
    inputs: [
      { name: "handleHash", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
