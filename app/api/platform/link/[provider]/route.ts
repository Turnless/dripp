import { NextRequest, NextResponse } from "next/server";
import { LINK_NONCE_COOKIE, signState } from "@/lib/oauth";
import { getAuthenticatedUser } from "@/lib/privy-server";

/**
 * Step 1 of platform linking: build the platform's own OAuth consent URL for
 * the already-logged-in-via-Privy user. Google is reused for YouTube
 * (a Google account IS a YouTube identity); Kick has its own OAuth endpoint.
 *
 * Called with POST + `Authorization: Bearer <Privy access token>` and returns
 * `{ url }` for the client to navigate to. The user is identified ONLY from
 * the verified token -- never from a query param -- and an httpOnly nonce
 * cookie binds the flow to this browser (checked in the callback route).
 *
 * *** VERIFY BEFORE USE ***
 * Confirm Kick's current OAuth authorize URL and required scopes against
 * their published API docs -- treat the URL below as a placeholder shape.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });
  }

  const redirectUri = `${process.env.APP_BASE_URL}/api/platform/callback/${params.provider}`;
  let url: URL;

  if (params.provider === "youtube") {
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID as string);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/youtube.readonly"
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else if (params.provider === "kick") {
    // TODO: confirm this authorize URL and scope name against current Kick docs.
    url = new URL("https://id.kick.com/oauth/authorize");
    url.searchParams.set("client_id", process.env.KICK_CLIENT_ID as string);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user:read channel:read");
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const { state, nonce } = signState(user.id);
  url.searchParams.set("state", state);

  const res = NextResponse.json({ url: url.toString() });
  res.cookies.set(LINK_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax still sends the cookie on the top-level redirect back from Google/Kick.
    sameSite: "lax",
    path: "/api/platform/callback",
    maxAge: 10 * 60,
  });
  return res;
}
