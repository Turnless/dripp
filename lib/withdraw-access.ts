import "server-only";
import type { LinkedAccount } from "@privy-io/node";
import { privy } from "@/lib/privy-server";

type LinkedAccountGoogleOAuth = Extract<LinkedAccount, { type: "google_oauth" }>;

/**
 * Withdrawing to a wallet address is the stand-in until the offramp
 * (Mercuryo) can pay out to a bank or card -- see the PRD's non-goals. It
 * shows an address field, so it's only offered to the Google accounts listed
 * in WITHDRAW_TO_ADDRESS_EMAILS (comma-separated; "*" means everyone). Unset
 * means nobody: the Withdraw button stays "open soon".
 */
export function mayWithdrawToAddress(email: string | null | undefined): boolean {
  const list = (process.env.WITHDRAW_TO_ADDRESS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes("*")) return true;
  return !!email && list.includes(email.trim().toLowerCase());
}

/** The same check for a verified Privy user, reading their Google email from Privy. */
export async function privyUserMayWithdrawToAddress(privyId: string): Promise<boolean> {
  if (!process.env.WITHDRAW_TO_ADDRESS_EMAILS) return false;
  const user = await privy().users()._get(privyId);
  const google = user.linked_accounts.find((a): a is LinkedAccountGoogleOAuth => a.type === "google_oauth");
  return mayWithdrawToAddress(google?.email);
}
