import "server-only";
import { supabaseServer } from "@/lib/supabase";
import { verificationFor } from "@/lib/viewer-verification";

/**
 * The crypto option ("I use a crypto wallet" on Profile, off by default).
 * When on, Add money shows the deposit address. Withdrawing to a wallet
 * address also needs a verified account (lib/bot-check.ts), because it pays
 * out to any address. Until the onramp/offramp (Mercuryo) is live, card and
 * bank show "coming soon" for everyone.
 */

export type WithdrawToAddressBlock = "crypto_off" | "unverified" | null;

/** Why withdrawing to a wallet address isn't allowed, or null if it is. */
export function withdrawToAddressBlock(cryptoEnabled: boolean, verified: boolean): WithdrawToAddressBlock {
  if (!cryptoEnabled) return "crypto_off";
  if (!verified) return "unverified";
  return null;
}

export const WITHDRAW_BLOCK_ERRORS: Record<Exclude<WithdrawToAddressBlock, null>, string> = {
  crypto_off: "Turn on \"I use a crypto wallet\" on Profile to withdraw to a wallet address.",
  unverified: "Verify your account on Profile to withdraw to a wallet address.",
};

/** The same check for a user, read from the database. */
export async function userWithdrawToAddressBlock(userId: string): Promise<WithdrawToAddressBlock> {
  const { data, error } = await supabaseServer().from("users").select("crypto_enabled").eq("id", userId).single();
  if (error) throw error;
  if (!data?.crypto_enabled) return "crypto_off";
  const { verified } = await verificationFor(userId);
  return withdrawToAddressBlock(true, verified);
}
