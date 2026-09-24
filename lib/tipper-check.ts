import "server-only";
import { supabaseServer } from "@/lib/supabase";
import { classifyTippers, type ClassifiedTipper, type VerifiedVia } from "@/lib/bot-check";

/** How far back the creator's bot/real breakdown looks. */
export const TIPPER_WINDOW_DAYS = 30;

/** Everyone who tipped this creator in the last 30 days, classified (lib/bot-check.ts). */
export async function classifiedTippers(creatorId: string): Promise<ClassifiedTipper[]> {
  const since = new Date(Date.now() - TIPPER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServer().rpc("tipper_signals", { p_creator: creatorId, p_since: since });
  if (error) throw error;
  return classifyTippers(
    ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      senderId: String(r.sender_id),
      accountCreatedAt: new Date(String(r.account_created_at)),
      firstTipAt: new Date(String(r.first_tip_at)),
      verifiedVia: (r.verified_via ?? null) as VerifiedVia | null,
    }))
  );
}
