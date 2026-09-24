import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { rateLimit } from "@/lib/rate-limit";
import { recordPhoneVerification, verificationFor } from "@/lib/viewer-verification";
import { PhoneVerifyError, checkCode, normalizePhone, phoneHash, phoneVerifyConfigured } from "@/lib/phone-verify";

const BodySchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().regex(/^\d{4,10}$/),
});

/**
 * Step 2 of phone verification: checks the code with Twilio and, if it's
 * right, records the phone (as a keyed hash -- one phone per account) and
 * the 'phone' verification.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  if (!phoneVerifyConfigured()) {
    return NextResponse.json({ error: "Phone verification isn't available yet." }, { status: 503 });
  }
  const limited = await rateLimit(req, "phoneCheck", user.id);
  if (limited) return limited;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) {
    return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
  }

  let approved: boolean;
  try {
    approved = await checkCode(phone, parsed.data.code);
  } catch (err) {
    if (err instanceof PhoneVerifyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("checking verification code failed", err);
    return NextResponse.json({ error: "We couldn't check that code right now. Please try again." }, { status: 502 });
  }
  if (!approved) {
    return NextResponse.json({ error: "That code isn't right. Check it and try again." }, { status: 400 });
  }

  try {
    const outcome = await recordPhoneVerification(user.id, phoneHash(phone));
    if (outcome === "taken") {
      return NextResponse.json({ error: "That number is already verifying another account." }, { status: 409 });
    }
    return NextResponse.json({ verification: await verificationFor(user.id) });
  } catch (err) {
    console.error("saving phone verification failed", err);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
