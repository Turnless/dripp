import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { normalizeHandle } from "@/lib/username-resolve";

/**
 * Server-Sent Events endpoint for the OBS overlay. Subscribes to Supabase
 * Realtime for new rows in `tips` whose recipient matches this username,
 * and forwards each one to the connected overlay as an SSE message.
 *
 * This matches the "push new tip alert" pattern described in
 * 04-architecture.md -- deliberately simple (SSE, one direction) rather than
 * a full WebSocket, since the overlay only ever needs to receive, never send.
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  const encoder = new TextEncoder();
  const db = supabaseServer();

  // The same handle can be linked on YouTube and on Kick by different
  // people, so the platform is part of the lookup. Overlay links without it
  // predate Kick support and are YouTube links.
  const platform = req.nextUrl.searchParams.get("platform") ?? "youtube";
  if (platform !== "youtube" && platform !== "kick") {
    return new Response("Unknown platform", { status: 400 });
  }

  const { data: user } = await db
    .from("platform_links")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_username", normalizeHandle(params.username))
    .maybeSingle();

  if (!user) {
    return new Response("Unknown username", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const channel = db
        .channel(`tips-for-${user.user_id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tips",
            filter: `recipient_id=eq.${user.user_id}`,
          },
          (payload) => {
            // The overlay URL is public (it's pasted into OBS), so send only
            // what the alert renders -- never sender/recipient IDs or tx_hash.
            const tip = payload.new as { amount: string | number; created_at: string };
            const alert = { amount: Number(tip.amount), created_at: tip.created_at };
            const message = `data: ${JSON.stringify(alert)}\n\n`;
            controller.enqueue(encoder.encode(message));
          }
        )
        .subscribe();

      // Keep the connection alive with a comment ping every 20s -- some
      // proxies close idle SSE connections without this.
      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 20000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        db.removeChannel(channel);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
