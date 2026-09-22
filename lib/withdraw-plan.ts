import { z } from "zod";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import { USDC_ADDRESS, centsToUnits, minimalErc20Abi } from "./chain";
import { withdrawalFee } from "./fees";

export const WithdrawSchema = z.object({
  amountUsd: z
    .number()
    .positive()
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Amount must be in whole cents"),
  // Where the payout goes. Supplied by the offramp integration (Mercuryo's
  // deposit address for this cash-out), never typed in or shown to the user.
  destination: z.string().refine((a) => isAddress(a), "Invalid destination"),
});
export type WithdrawInput = z.infer<typeof WithdrawSchema>;

export function treasuryAddress(): `0x${string}` | null {
  const a = process.env.TREASURY_ADDRESS;
  return a && isAddress(a) ? getAddress(a) : null;
}

/**
 * The 1% withdrawal fee is collected in the SAME onchain operation as the
 * payout: two USDC transfers batched into one smart-wallet call, so the fee
 * can't be skipped and the payout can't happen without it.
 */
export function planWithdrawal(input: WithdrawInput) {
  const treasury = treasuryAddress();
  if (!treasury) return null;
  const cents = Math.round(input.amountUsd * 100);
  const { fee, receive } = withdrawalFee(cents);
  const destination = getAddress(input.destination);
  const feeUnits = centsToUnits(fee);
  const payoutUnits = centsToUnits(receive);

  const calls = [
    ...(feeUnits > BigInt(0)
      ? [
          {
            to: USDC_ADDRESS,
            data: encodeFunctionData({ abi: minimalErc20Abi, functionName: "transfer", args: [treasury, feeUnits] }),
          },
        ]
      : []),
    {
      to: USDC_ADDRESS,
      data: encodeFunctionData({ abi: minimalErc20Abi, functionName: "transfer", args: [destination, payoutUnits] }),
    },
  ];

  return { treasury, destination, cents, feeCents: fee, feeUnits, payoutUnits, calls };
}
