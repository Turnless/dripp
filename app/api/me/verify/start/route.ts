import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/privy-server";
import { phoneVerifyLimit } from "@/lib/rate-limit";
import { phoneUsedByOther, verificationFor } from "@/lib/viewer-verification";
import {
  PhoneVerifyError,
  normalizePhone,
  phoneHash,
  phoneVerifyConfigured,
  sendCode,
} from "@/lib/phone-verify";

const BodySchema = z.object({
  phone: z.string().min(6).max(32),
  channel: z.enum(["whatsapp", "sms"]),
});

/**
 * Step 1 of phone verification: sends a one-time code by WhatsApp or SMS
 * (Twilio Verify, lib/phone-verify.ts). Every code costs dripp money, so the
 * checks run cheapest-first and nothing is sent unless all pass: signed in,
 * not verified yet, a plausible number, not already verifying another
 * account, and within the strict limits (phoneVerifyLimit).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }
  if (!phoneVerifyConfigured()) {
    return NextResponse.json({ error: "Phone verification isn't available yet." }, { status: 503 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) {
    return NextResponse.json(
      { error: "Enter your number with its country code, like +44 7700 900123." },
      { status: 400 }
    );
  }
  const hash = phoneHash(phone);

  try {
    const current = await verificationFor(user.id);
    if (current.verified) {
      return NextResponse.json({ error: "You're already verified.", verification: current }, { status: 409 });
    }
    if (await phoneUsedByOther(user.id, hash)) {
      return NextResponse.json({ error: "That number is already verifying another account." }, { status: 409 });
    }
  } catch (err) {
    console.error("phone verify precheck failed", err);
    return NextResponse.json({ error: "Verification is unavailable right now. Please try again later." }, { status: 503 });
  }

  const refused = await phoneVerifyLimit(req, user.id, hash);
  if (refused) return refused;

  try {
    await sendCode(phone, parsed.data.channel);
  } catch (err) {
    if (err instanceof PhoneVerifyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("sending verification code failed", err);
    return NextResponse.json({ error: "We couldn't send a code right now. Please try again later." }, { status: 502 });
  }
  return NextResponse.json({ sent: true, phone });
}
