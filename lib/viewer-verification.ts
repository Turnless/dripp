import "server-only";
import { supabaseServer } from "@/lib/supabase";
import { passesYoutubeViewerCheck, type VerifiedVia, type YoutubeViewerFacts } from "@/lib/bot-check";

/**
 * Viewer verification (rules in lib/bot-check.ts). Stored proofs live on
 * users.human_verified_via; "tipped $1+" is computed by viewer_verifications
 * (supabase/functions.sql). A proof, once recorded, is kept.
 */

export type Verification = { verified: boolean; via: VerifiedVia | null };

/** The verification of several users at once (id -> via, or null). */
export async function verificationsFor(userIds: string[]): Promise<Map<string, VerifiedVia | null>> {
  const out = new Map<string, VerifiedVia | null>();
  if (!userIds.length) return out;
  const { data, error } = await supabaseServer().rpc("viewer_verifications", { p_users: userIds });
  if (error) throw error;
  for (const r of (data ?? []) as { user_id: string; via: VerifiedVia | null }[]) out.set(r.user_id, r.via);
  return out;
}

export async function verificationFor(userId: string): Promise<Verification> {
  const via = (await verificationsFor([userId])).get(userId) ?? null;
  return { verified: !!via, via };
}

/** Records a proof unless the user already has one (the first proof stands). */
export async function recordVerification(userId: string, via: "youtube" | "phone" | "topup"): Promise<void> {
  const { error } = await supabaseServer()
    .from("users")
    .update({ human_verified_at: new Date().toISOString(), human_verified_via: via })
    .eq("id", userId)
    .is("human_verified_via", null);
  if (error) throw error;
}

/** Is this phone (hash) already verifying a different account? */
export async function phoneUsedByOther(userId: string, hash: string): Promise<boolean> {
  const { data, error } = await supabaseServer()
    .from("users")
    .select("id")
    .eq("phone_hash", hash)
    .neq("id", userId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Records a verified phone (by hash) and the 'phone' verification. Returns
 * "taken" if another account verified this phone first (the unique index
 * on users.phone_hash settles a race).
 */
export async function recordPhoneVerification(userId: string, hash: string): Promise<"recorded" | "taken"> {
  const { error } = await supabaseServer().from("users").update({ phone_hash: hash }).eq("id", userId);
  if (error) {
    if ((error as { code?: string }).code === "23505") return "taken";
    throw error;
  }
  await recordVerification(userId, "phone");
  return "recorded";
}

/**
 * Reads what the YouTube check needs from the viewer's own account, with the
 * access token from linking (youtube.readonly): how many channels they
 * subscribe to and how many videos they've liked. Only these counts are
 * used; which channels or videos is never read or stored.
 */
export async function youtubeViewerFacts(accessToken: string, channelCreatedAt: string): Promise<YoutubeViewerFacts> {
  const get = async (url: string) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return Number(json.pageInfo?.totalResults ?? 0);
  };
  const [subscriptions, likedVideos] = await Promise.all([
    get("https://www.googleapis.com/youtube/v3/subscriptions?part=id&mine=true&maxResults=1"),
    get("https://www.googleapis.com/youtube/v3/videos?part=id&myRating=like&maxResults=1"),
  ]);
  return { channelCreatedAt: new Date(channelCreatedAt), subscriptions, likedVideos };
}

/** Runs the YouTube check for a just-linked channel; records it if they pass. Returns whether they passed. */
export async function checkYoutubeViewer(
  userId: string,
  accessToken: string,
  channelCreatedAt: string | undefined
): Promise<boolean> {
  if (!channelCreatedAt) return false;
  const facts = await youtubeViewerFacts(accessToken, channelCreatedAt);
  if (!passesYoutubeViewerCheck(facts)) return false;
  await recordVerification(userId, "youtube");
  return true;
}
