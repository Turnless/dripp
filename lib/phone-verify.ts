import "server-only";
import { createHmac } from "crypto";

/**
 * Phone verification through Twilio Verify, sent by WhatsApp or SMS (viewer
 * verification, lib/bot-check.ts). dripp's server sends every code, so the
 * strict limits in phoneVerifyLimit (lib/rate-limit.ts) are a real gate.
 *
 * The number itself is never stored: only a keyed hash (phoneHash), which
 * is enough to stop one phone verifying two accounts.
 *
 * Talks to Twilio's REST API directly (no SDK): see
 * https://www.twilio.com/docs/verify/api/verification and
 * https://www.twilio.com/docs/verify/api/verification-check
 */

export type Channel = "whatsapp" | "sms";

/**
 * A phone number in international (E.164) form: "+", a country code, and up
 * to 15 digits. Spaces, dashes, dots and brackets are removed; a leading
 * "00" is read as "+". Returns null if it isn't a plausible number.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** Keyed hash of a normalized number, for the one-phone-one-account rule. */
export function phoneHash(phone: string): string {
  const secret = process.env.PHONE_HASH_SECRET;
  if (!secret || secret.length < 16) throw new Error("PHONE_HASH_SECRET is missing or too short");
  return createHmac("sha256", secret).update(phone).digest("hex");
}

export function phoneVerifyConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID &&
    process.env.PHONE_HASH_SECRET
  );
}

/** A Twilio problem worth telling the viewer about, with a status to send back. */
export class PhoneVerifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function twilio(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID as string;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return json;

  // Twilio error codes: https://www.twilio.com/docs/api/errors
  const code = Number(json.code);
  console.error("Twilio Verify error", res.status, code, json.message);
  if (code === 60200 || code === 21211 || code === 21614) {
    throw new PhoneVerifyError("That doesn't look like a number we can send to. Check it and try again.", 400);
  }
  if (code === 60203 || code === 60202) {
    throw new PhoneVerifyError("Too many attempts for this number. Please try again later.", 429);
  }
  if (code === 60410 || code === 60605 || code === 21408) {
    throw new PhoneVerifyError("We can't send codes to that country yet.", 400);
  }
  if (res.status === 404 && path === "VerificationCheck") {
    // The code expired (10 minutes) or was already used.
    throw new PhoneVerifyError("That code has expired. Ask for a new one.", 400);
  }
  throw new PhoneVerifyError("We couldn't send a code right now. Please try again later.", 502);
}

/** Sends a one-time code to a normalized number. */
export async function sendCode(phone: string, channel: Channel): Promise<void> {
  await twilio("Verifications", { To: phone, Channel: channel });
}

/** True if the code is right for this number (Twilio also limits wrong guesses). */
export async function checkCode(phone: string, code: string): Promise<boolean> {
  const result = await twilio("VerificationCheck", { To: phone, Code: code });
  return result.status === "approved";
}
