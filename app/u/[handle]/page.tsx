import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, Hourglass, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Wordmark } from "@/components/ui/misc";
import { normalizeHandle } from "@/lib/username-resolve";
import { supabaseServer } from "@/lib/supabase";
import { formatUsd } from "@/lib/format";
import { visibilityFromRow, type ProfileVisibility } from "@/lib/profile-visibility";
import { youtubeSubscriberCount } from "@/lib/youtube";

// Totals and the owner's choices change at any time; always read them fresh.
export const dynamic = "force-dynamic";

type Profile =
  | { kind: "not_found"; handle: string }
  | {
      kind: "found";
      handle: string;
      /** Linked YouTube handle, if any. */
      youtubeHandle: string | null;
      avatarUrl: string | null;
      verified: boolean;
      show: ProfileVisibility;
      receivedCents: number;
      receivedCount: number;
      sentCents: number;
      sentCount: number;
      subscribers: number | null;
    };

/**
 * A public page, by dripp username or linked YouTube handle: name and verified badge, plus whichever of
 * their totals and subscriber count they chose to show on Profile ("What
 * people see", PRD 7.1). Anything they hide is never read or sent to the
 * page. Dollars and handles only.
 */
async function loadProfile(raw: string): Promise<Profile> {
  noStore();
  const handle = normalizeHandle(decodeURIComponent(raw));
  const db = supabaseServer();

  // A dripp username first; then a linked YouTube handle, so older /u/<handle>
  // links keep working.
  let { data: owner } = await db.from("users").select("*").eq("username", handle).maybeSingle();
  if (!owner) {
    // A name changed in the last 30 days still leads to its owner's new page.
    const { data: hold } = await db
      .from("username_holds")
      .select("user_id, held_until")
      .eq("username", handle)
      .gt("held_until", new Date().toISOString())
      .maybeSingle();
    if (hold) {
      const { data: moved } = await db.from("users").select("username").eq("id", hold.user_id).maybeSingle();
      if (moved?.username) redirect(`/u/${moved.username}`);
    }
  }

  let link: { user_id: string; platform_username: string; avatar_url: string | null; channel_id: string | null } | null =
    null;
  if (owner) {
    const { data } = await db
      .from("platform_links")
      .select("user_id, platform_username, avatar_url, channel_id")
      .eq("platform", "youtube")
      .eq("user_id", owner.id)
      .maybeSingle();
    link = data;
  } else {
    const { data } = await db
      .from("platform_links")
      .select("user_id, platform_username, avatar_url, channel_id")
      .eq("platform", "youtube")
      .eq("platform_username", handle)
      .maybeSingle();
    if (!data) return { kind: "not_found", handle };
    link = data;
    // A failed read shows nothing (visibilityFromRow treats missing as hidden).
    ({ data: owner } = await db.from("users").select("*").eq("id", data.user_id).maybeSingle());
  }

  const userId = (owner?.id as string | undefined) ?? link?.user_id;
  const show = visibilityFromRow(owner);

  let totals: Record<string, unknown> = {};
  if (userId && (show.received || show.sent)) {
    const { data } = await db.rpc("profile_totals", { p_user_id: userId });
    totals = (Array.isArray(data) ? data[0] : data) ?? {};
  }
  let subscribers: number | null = null;
  if (show.subscribers && link?.channel_id) {
    try {
      subscribers = await youtubeSubscriberCount(link.channel_id);
    } catch (err) {
      console.error("public profile subscriber count failed", err);
    }
  }

  return {
    kind: "found",
    handle: (owner?.username as string | null) ?? link?.platform_username ?? handle,
    youtubeHandle: link?.platform_username ?? null,
    avatarUrl: link?.avatar_url ?? null,
    verified: !!link?.channel_id,
    show,
    receivedCents: show.received ? Math.round(Number(totals.received ?? 0) * 100) : 0,
    receivedCount: show.received && show.tipCounts ? Number(totals.received_count ?? 0) : 0,
    sentCents: show.sent ? Math.round(Number(totals.sent ?? 0) * 100) : 0,
    sentCount: show.sent && show.tipCounts ? Number(totals.sent_count ?? 0) : 0,
    subscribers,
  };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const handle = normalizeHandle(decodeURIComponent(params.handle));
  return { title: `@${handle} on dripp`, description: `Tip @${handle} on dripp. It arrives in about a second.` };
}

export default async function PublicProfilePage({ params }: { params: { handle: string } }) {
  const p = await loadProfile(params.handle);

  return (
    <div className="bg-field min-h-dvh px-4 pb-16 pt-6">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <Link href="/" aria-label="dripp home" className="self-center">
          <Wordmark />
        </Link>

        <GlassCard level="thick" className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
          <span className="relative">
            <Avatar
              src={p.kind === "found" ? p.avatarUrl : null}
              name={p.handle}
              className="h-20 w-20 text-[2rem]"
            />
            {p.kind !== "not_found" && p.verified && (
              <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-brand text-text ring-2 ring-bg">
                <BadgeCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              </span>
            )}
          </span>
          <div>
            <h1 className="text-title-1">@{p.handle}</h1>
            <p className="mt-1 text-caption text-muted">
              {p.kind === "not_found"
                ? "Not on dripp yet"
                : p.youtubeHandle
                  ? `${p.verified ? "Verified YouTube channel" : "YouTube channel"} · @${p.youtubeHandle}`
                  : "On dripp"}
            </p>
          </div>

          {p.kind === "found" && p.show.subscribers && p.subscribers !== null && (
            <p className="text-caption font-semibold text-muted">
              <span className="num text-text">{compact.format(p.subscribers)}</span> subscribers
            </p>
          )}
          {p.kind === "found" && (p.show.received || p.show.sent) && (
            <dl className={`mt-3 grid w-full gap-3 text-left ${p.show.received && p.show.sent ? "grid-cols-2" : "grid-cols-1"}`}>
              {p.show.received && (
                <Total
                  label="Received"
                  cents={p.receivedCents}
                  count={p.show.tipCounts ? p.receivedCount : null}
                  highlight
                />
              )}
              {p.show.sent && (
                <Total label="Tipped out" cents={p.sentCents} count={p.show.tipCounts ? p.sentCount : null} />
              )}
            </dl>
          )}
          {p.kind === "found" && !p.show.received && !p.show.sent && (
            <p className="mt-2 flex items-center gap-2 text-caption text-muted">
              <Lock className="h-4 w-4" aria-hidden /> @{p.handle} keeps their totals private.
            </p>
          )}
          {p.kind === "not_found" && (
            <p className="mt-2 flex items-start gap-2 text-left text-caption text-muted">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              You can still tip them. We hold it until they join dripp and link their channel.
            </p>
          )}
        </GlassCard>

        <Link
          href="/"
          className="pressable flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-7 font-semibold text-on-primary shadow-primary hover:bg-primary-hover"
        >
          Tip @{p.handle} on dripp <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <p className="text-center text-caption text-muted">Tips are free. Sign in with Google to send one.</p>
      </div>
    </div>
  );
}

function Total({
  label,
  cents,
  count,
  highlight,
}: {
  label: string;
  cents: number;
  count: number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-card p-4 ${highlight ? "bg-brand" : "bg-text/[0.05]"}`}>
      <dt className={`text-caption ${highlight ? "text-on-brand" : "text-muted"}`}>{label}</dt>
      <dd className="num mt-1 text-[1.75rem] font-extrabold leading-none tracking-[-0.045em]">{formatUsd(cents)}</dd>
      {count !== null && (
        <dd className={`mt-1.5 text-caption ${highlight ? "text-on-brand" : "text-muted"}`}>
          {count} {count === 1 ? "tip" : "tips"}
        </dd>
      )}
    </div>
  );
}
