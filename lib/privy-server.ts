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

export function privy(): PrivyClient {
  if (!client) {
    client = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID as string,
      appSecret: process.env.PRIVY_APP_SECRET as string,
      // Optional: with the key set, tokens are verified locally instead of
      // fetching Privy's JWKS over the network.
      jwtVerificationKey: process.env.PRIVY_JWT_VERIFICATION_KEY || undefined,
    });
  }
  return client;
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
  } catch {
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
