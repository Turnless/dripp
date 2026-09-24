import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { phoneVerifyLimit } from "@/lib/rate-limit";
import { verificationFor } from "@/lib/viewer-verification";

/**
 * Asked before opening Privy's phone verification (each attempt sends a
 * paid code). Refuses people who are already verified, and anyone over the
 * strict limits in phoneVerifyLimit (lib/rate-limit.ts).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  try {
    if ((await verificationFor(user.id)).verified) {
      return NextResponse.json({ error: "You're already verified." }, { status: 409 });
    }
  } catch (err) {
    console.error("verification read failed", err);
    return NextResponse.json({ error: "Verification is unavailable right now. Please try again later." }, { status: 503 });
  }

  const refused = await phoneVerifyLimit(req, user.id);
  if (refused) return refused;
  return NextResponse.json({ ok: true });
}
