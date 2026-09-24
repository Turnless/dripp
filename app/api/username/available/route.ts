import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase";
import { checkUsername } from "@/lib/usernames";

/**
 * Live "is this username free?" while someone types one (signed-in only).
 * The final say is set_username's, which also checks the 30-day rules.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "resolve", user.id);
  if (limited) return limited;

  const check = checkUsername(req.nextUrl.searchParams.get("u") ?? "");
  if (!check.ok) return NextResponse.json({ available: false, reason: check.error });

  const db = supabaseServer();
  const [{ data: owner, error }, { data: hold, error: holdErr }] = await Promise.all([
    db.from("users").select("id").eq("username", check.username).maybeSingle(),
    db.from("username_holds").select("user_id, held_until").eq("username", check.username).maybeSingle(),
  ]);
  if (error || holdErr) {
    console.error("username availability check failed", error ?? holdErr);
    return NextResponse.json({ error: "We couldn't check that right now." }, { status: 500 });
  }
  const mine = owner?.id === user.id;
  const takenByOther = !!owner && !mine;
  const heldByOther = !!hold && hold.user_id !== user.id && Date.parse(hold.held_until) > Date.now();
  return NextResponse.json({
    username: check.username,
    available: !takenByOther && !heldByOther,
    mine,
    reason: takenByOther ? "That username is taken." : heldByOther ? "That username was used recently." : null,
  });
}
