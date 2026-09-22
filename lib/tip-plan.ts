import { z } from "zod";
import { encodeFunctionData, getAddress } from "viem";
import { USDC_ADDRESS, centsToUnits, minimalErc20Abi } from "./chain";
import { handleHash, tipVaultAbi, tipVaultAddress } from "./tipvault";
import { normalizeHandle, resolveRecipient } from "./username-resolve";

// Upper bound per tip -- limits the damage of a compromised session or a
// client bug. Keep in sync with MAX_TIP_CENTS in lib/fees.ts.
const MAX_TIP_USD = 1000;

export const TipSchema = z.object({
  platform: z.enum(["youtube", "kick"]),
  toUsername: z.string().trim().min(1).max(100),
  amountUsd: z
    .number()
    .positive()
    .max(MAX_TIP_USD)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Amount must be in whole cents"),
});
export type TipInput = z.infer<typeof TipSchema>;

type Call = { to: `0x${string}`; data: `0x${string}` };

export type TipPlan =
  | {
      kind: "direct";
      platform: "youtube" | "kick";
      username: string;
      recipientId: string;
      recipientWallet: `0x${string}`;
      units: bigint;
      calls: Call[];
    }
  | { kind: "escrow"; platform: "youtube" | "kick"; username: string; hash: `0x${string}`; units: bigint; calls: Call[] };

export type PlanError = { error: string; status: number };

/**
 * Works out where a tip goes and the exact onchain calls that move it.
 * Called once, by /api/tip/prepare, which saves the result as a tip_intents
 * row; /api/tip/confirm checks the transaction against that saved row rather
 * than working the recipient out again (it could have changed in between,
 * e.g. the creator linking their channel mid-send).
 *
 * Tips are free: the recipient gets the full amount (fee is on withdrawals).
 */
export async function planTip(senderId: string, input: TipInput): Promise<TipPlan | PlanError> {
  const units = centsToUnits(Math.round(input.amountUsd * 100));
  const recipient = await resolveRecipient(input.platform, input.toUsername);

  if (recipient.status === "not_found") {
    return { error: "That username doesn't exist on the selected platform", status: 404 };
  }

  if (recipient.status === "existing_user") {
    if (recipient.userId === senderId) return { error: "You can't tip yourself", status: 400 };
    const to = getAddress(recipient.walletAddress);
    return {
      kind: "direct",
      platform: input.platform,
      username: normalizeHandle(input.toUsername),
      recipientId: recipient.userId,
      recipientWallet: to,
      units,
      calls: [
        {
          to: USDC_ADDRESS,
          data: encodeFunctionData({ abi: minimalErc20Abi, functionName: "transfer", args: [to, units] }),
        },
      ],
    };
  }

  // Not on dripp yet: approve + deposit into the TipVault escrow, in one operation.
  const vault = tipVaultAddress();
  if (!vault) {
    return { error: "Tipping people who haven't joined yet isn't available yet", status: 501 };
  }
  const hash = handleHash(recipient.platform, recipient.platformUsername);
  return {
    kind: "escrow",
    platform: recipient.platform,
    username: recipient.platformUsername,
    hash,
    units,
    calls: [
      {
        to: USDC_ADDRESS,
        data: encodeFunctionData({ abi: minimalErc20Abi, functionName: "approve", args: [vault, units] }),
      },
      {
        to: vault,
        data: encodeFunctionData({ abi: tipVaultAbi, functionName: "depositPending", args: [hash, units] }),
      },
    ],
  };
}

export const isPlanError = (p: TipPlan | PlanError): p is PlanError => "error" in p;
