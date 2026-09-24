import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedPrivyId, getAuthenticatedUser, privy } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { recordPhoneIfLinked, verificationFor } from "@/lib/viewer-verification";

/**
 * Re-checks the caller's viewer verification -- called right after they
 * verify a phone number through Privy's popup. The phone is read from Privy's
 * server API, never from the request.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  const privyId = await getAuthenticatedPrivyId(req);
  if (!user || !privyId) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  const limited = await rateLimit(req, "platformLink", user.id);
  if (limited) return limited;

  try {
    await recordPhoneIfLinked(user.id, await privy().users()._get(privyId));
    return NextResponse.json({ verification: await verificationFor(user.id) });
  } catch (err) {
    console.error("viewer verification failed", err);
    return NextResponse.json({ error: "We couldn't check that right now. Please try again." }, { status: 500 });
  }
}
