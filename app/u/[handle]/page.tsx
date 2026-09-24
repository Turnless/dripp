import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Hourglass, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { GlassCard } from "@/components/ui/GlassCard";
import { Wordmark } from "@/components/ui/misc";
import { normalizeHandle } from "@/lib/username-resolve";
import { supabaseServer } from "@/lib/supabase";
import { formatUsd } from "@/lib/format";

// Totals change with every tip; read them fresh.
export const dynamic = "force-dynamic";

type Profile =
  | { kind: "not_found"; handle: string }
  | { kind: "private"; handle: string; avatarUrl: string | null; verified: boolean }
  | {
      kind: "public";
      handle: string;
      avatarUrl: string | null;
      verified: boolean;
      receivedCents: number;
      receivedCount: number;
      sentCents: number;
      sentCount: number;
    };

/**
 * A creator's public page: handle, verified badge and -- unless they turned
 * it off on their Profile -- everything they've received and tipped out
 * (PRD 7.1, a transparency signal). Dollars and handles only.
 */
async function loadProfile(raw: string): Promise<Profile> {
  const handle = normalizeHandle(decodeURIComponent(raw));
  const db = supabaseServer();
  const { data: link } = await db
    .from("platform_links")
    .select("user_id, platform_username, avatar_url, channel_id, users(*)")
    .eq("platform", "youtube")
    .eq("platform_username", handle)
    .maybeSingle();
  if (!link) return { kind: "not_found", handle };

  const base = { handle: link.platform_username, avatarUrl: link.avatar_url, verified: !!link.channel_id };
  const owner = link.users as unknown as { profile_public?: boolean } | null;
  if (owner && owner.profile_public === false) return { kind: "private", ...base };

  const { data } = await db.rpc("profile_totals", { p_user_id: link.user_id });
  const t = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    kind: "public",
    ...base,
    receivedCents: Math.round(Number(t.received ?? 0) * 100),
    receivedCount: Number(t.received_count ?? 0),
    sentCents: Math.round(Number(t.sent ?? 0) * 100),
    sentCount: Number(t.sent_count ?? 0),
  };
}

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
              src={p.kind === "not_found" ? null : p.avatarUrl}
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
                : p.verified
                  ? "Verified YouTube channel"
                  : "YouTube channel"}
            </p>
          </div>

          {p.kind === "public" && (
            <dl className="mt-3 grid w-full grid-cols-2 gap-3 text-left">
              <Total label="Received" cents={p.receivedCents} count={p.receivedCount} highlight />
              <Total label="Tipped out" cents={p.sentCents} count={p.sentCount} />
            </dl>
          )}
          {p.kind === "private" && (
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

function Total({ label, cents, count, highlight }: { label: string; cents: number; count: number; highlight?: boolean }) {
  return (
    <div className={`rounded-card p-4 ${highlight ? "bg-brand" : "bg-text/[0.05]"}`}>
      <dt className={`text-caption ${highlight ? "text-on-brand" : "text-muted"}`}>{label}</dt>
      <dd className="num mt-1 text-[1.75rem] font-extrabold leading-none tracking-[-0.045em]">{formatUsd(cents)}</dd>
      <dd className={`mt-1.5 text-caption ${highlight ? "text-on-brand" : "text-muted"}`}>
        {count} {count === 1 ? "tip" : "tips"}
      </dd>
    </div>
  );
}
