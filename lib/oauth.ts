import crypto from "crypto";

/**
 * Minimal signed-state helper for the platform-link OAuth flow (used instead
 * of pulling in NextAuth, since NextAuth is designed to BE the primary
 * session system -- Privy already owns primary login + wallet, so bolting
 * NextAuth on top just for linking a YouTube/Kick account would mean running
 * two overlapping auth systems, which is exactly the kind of avoidable
 * mistake this scaffold is trying not to make).
 *
 * The "state" param carries the already-logged-in user's id through the
 * OAuth redirect round trip, signed so it can't be tampered with. It also
 * carries a random nonce that must match an httpOnly cookie set on the
 * browser that started the flow -- without that binding, an attacker could
 * start a link for THEIR account, send the consent URL to a creator, and
 * have the creator's channel (and pending tips) land on the attacker's
 * account.
 */
export const LINK_NONCE_COOKIE = "dripp_link_nonce";

const STATE_TTL_MS = 10 * 60 * 1000;
const PLACEHOLDER_SECRETS = new Set([
  "change-me-to-a-random-string",
  "dev-only-secret-change-me",
]);

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET ?? "";
  // Fail closed: a missing or placeholder secret would let anyone forge state.
  if (s.length < 32 || PLACEHOLDER_SECRETS.has(s)) {
    throw new Error(
      "OAUTH_STATE_SECRET must be a random string of at least 32 characters"
    );
  }
  return s;
}

function hmac(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest();
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Where the browser goes back to after linking -- only these two pages. */
export type LinkReturnPath = "/creator" | "/profile";
const RETURN_PATHS: LinkReturnPath[] = ["/creator", "/profile"];

export function signState(
  userId: string,
  returnTo: LinkReturnPath = "/profile"
): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ userId, nonce, ts: Date.now(), returnTo });
  const sig = hmac(payload).toString("hex");
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
  return { state, nonce };
}

export function verifyState(
  state: string,
  cookieNonce: string | undefined
): { userId: string; returnTo: LinkReturnPath } | null {
  if (!cookieNonce) return null;
  try {
    const { payload, sig } = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    );
    if (typeof payload !== "string" || typeof sig !== "string") return null;
    if (!safeEqual(Buffer.from(sig, "hex"), hmac(payload))) return null;

    const { userId, nonce, ts, returnTo } = JSON.parse(payload);
    if (typeof userId !== "string" || typeof nonce !== "string" || typeof ts !== "number") {
      return null;
    }
    if (Date.now() - ts > STATE_TTL_MS) return null;
    if (!safeEqual(Buffer.from(nonce), Buffer.from(cookieNonce))) return null;
    return { userId, returnTo: RETURN_PATHS.includes(returnTo) ? returnTo : "/profile" };
  } catch {
    return null;
  }
}
