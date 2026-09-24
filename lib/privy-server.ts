import "server-only";
import { PrivyClient } from "@privy-io/node";
import { supabaseServer } from "./supabase";

/**
 * Server-only Privy helpers. Never import this from a client component --
 * it reads PRIVY_APP_SECRET.
 *
 * API shape confirmed against the installed @privy-io/node@0.34 type
 * definitions (PrivyClient -> utils().auth().verifyAccessToken).
 */

let client: PrivyClient | null = null;
let networkClient: PrivyClient | null = null;

/**
 * Privy's JWT verification key, normalized. Environment editors mangle
 * multi-line values in several predictable ways, and a mangled key makes
 * EVERY request 401, so accept the common shapes:
 *   - full PEM with real line breaks (what the dashboard shows)
 *   - one line with literal \n escapes
 *   - wrapped in quotes
 *   - bare base64 with the PEM header/footer missing
 * Anything that still doesn't look like a key is ignored with a warning, and
 * verification falls back to fetching Privy's key over the network.
 */
function verificationKey(): string | undefined {
  const raw = process.env.PRIVY_JWT_VERIFICATION_KEY?.trim();
  if (!raw) return undefined;

  let key = raw.replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n").trim();
  if (!key.includes("BEGIN")) {
    const body = key.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(body) || body.length < 80) {
      console.warn("PRIVY_JWT_VERIFICATION_KEY doesn't look like a key -- ignoring it.");
      return undefined;
    }
    key = `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
  }
  return key;
}

export function privy(): PrivyClient {
  if (!client) {
    client = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID as string,
      appSecret: process.env.PRIVY_APP_SECRET as string,
      // Optional speed-up: verifies logins locally instead of fetching
      // Privy's key over the network. Same security either way.
      jwtVerificationKey: verificationKey(),
    });
  }
  return client;
}

/** Same client, but always verifies against Privy's published key. */
function privyViaNetwork(): PrivyClient {
  if (!networkClient) {
    networkClient = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID as string,
      appSecret: process.env.PRIVY_APP_SECRET as string,
    });
  }
  return networkClient;
}

/**
 * Returns the Privy user ID (`did:privy:...`) of the caller, taken from a
 * verified `Authorization: Bearer <access token>` header, or null if the
 * header is missing or the token is invalid/expired.
 *
 * This is the ONLY trusted source of "who is making this request" -- never
 * take a user ID from the request body or query string.
 */
export async function getAuthenticatedPrivyId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return null;

  try {
    const { user_id } = await privy().utils().auth().verifyAccessToken(token);
    return user_id;
  } catch (err) {
    // A wrong/mangled PRIVY_JWT_VERIFICATION_KEY would otherwise 401 every
    // request. Retry once against Privy's published key -- same strictness,
    // just a network round trip -- so a bad key costs speed, not sign-in.
    if (verificationKey()) {
      try {
        const { user_id } = await privyViaNetwork().utils().auth().verifyAccessToken(token);
        console.warn(
          "PRIVY_JWT_VERIFICATION_KEY appears wrong: the token verified against Privy's published key instead. Fix or remove the env var."
        );
        return user_id;
      } catch {
        // Fall through: the token itself is invalid.
      }
    }
    // Logged (not returned) so a 401 can be diagnosed from the server logs
    // without telling the caller anything useful.
    console.error("Privy token verification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The caller's `users` row, resolved from a verified Privy access token.
 * Null if the token is missing/invalid or the user has no row yet.
 */
export async function getAuthenticatedUser(
  req: Request
): Promise<{ id: string; wallet_address: string } | null> {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return null;

  const { data } = await supabaseServer()
    .from("users")
    .select("id, wallet_address")
    .eq("privy_id", privyId)
    .maybeSingle();
  return data ?? null;
}
