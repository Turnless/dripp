"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Play } from "lucide-react";
import { useAccount } from "@/components/account";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { springs } from "@/components/motion";
import { useAuthedFetch, readError } from "@/lib/hooks";
import { announceMoneyChanged } from "@/lib/money-client";
import { formatUsd } from "@/lib/format";
import { VerifyPhoneButton } from "@/components/VerificationCard";

/**
 * Linking a YouTube channel -- open to everyone: creators do it on the
 * Creator page, viewers on Profile. Linking lets people tip you by your
 * handle and collects anything sent to it before you joined.
 */

type LinkPage = "creator" | "profile";

// Messages for `?link_error=` from the platform-link callback route.
const LINK_ERRORS: Record<string, string> = {
  cancelled: "Linking was cancelled. You can try again any time.",
  expired: "That link attempt expired. Please try again.",
  not_verified: "We couldn't verify your YouTube account. Please try again.",
  no_channel:
    "That Google account doesn't have a YouTube channel with a handle. Pick the account that owns your channel.",
  unavailable: "Linking that platform isn't available yet.",
  failed: "We couldn't link your channel. Please try again.",
};

/** Reads what the link callback reported (collected tips or an error) and clears it from the URL. */
function useLinkOutcome(page: LinkPage) {
  const [collectedCents, setCollectedCents] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Set after a link: did linking this channel verify them as a viewer?
  const [linkedVerified, setLinkedVerified] = useState<boolean | null>(null);
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const collected = Number(search.get("collected"));
    if (collected > 0) {
      setCollectedCents(collected);
      announceMoneyChanged();
    }
    if (search.has("verified")) setLinkedVerified(search.get("verified") === "1");
    const error = search.get("link_error");
    if (error) setLinkError(LINK_ERRORS[error] ?? LINK_ERRORS.failed);
    if (search.has("collected") || search.has("link_error") || search.has("linked") || search.has("verified")) {
      window.history.replaceState(null, "", `/${page}`);
    }
  }, [page]);
  return { collectedCents, linkError, setLinkError, linkedVerified };
}

/** Celebration card when linking released tips that were waiting. */
function CollectedBanner({ cents }: { cents: number }) {
  return (
    <motion.div
      initial={{ scale: 0.94, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springs.soft}
      className="bg-brand-gradient relative overflow-hidden rounded-card p-6 text-white shadow-primary"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/25 blur-2xl" />
      <p className="relative text-caption text-white/80">Tips that were waiting for you</p>
      <p className="num relative mt-1 text-[2.75rem] font-extrabold leading-none tracking-[-0.045em] text-brand">
        +{formatUsd(cents)}
      </p>
      <p className="relative mt-2 text-white/90">Collected. It&apos;s in your balance now.</p>
    </motion.div>
  );
}

/**
 * The linked channel (picture, handle, verified), or the button to link one,
 * plus the result of a link that just finished.
 */
export function ChannelCard({
  page,
  blurb,
  footer,
}: {
  page: LinkPage;
  blurb: string;
  /** Shown under a linked channel (e.g. the creator's week). */
  footer?: React.ReactNode;
}) {
  const { links } = useAccount();
  const authedFetch = useAuthedFetch();
  const [linking, setLinking] = useState(false);
  const { collectedCents, linkError, setLinkError, linkedVerified } = useLinkOutcome(page);
  const { verification } = useAccount();
  const youtube = links.find((l) => l.platform === "youtube");

  async function linkYoutube() {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await authedFetch(`/api/platform/link/youtube?from=${page}`, { method: "POST" });
      if (!res.ok) {
        setLinkError(await readError(res));
        return setLinking(false);
      }
      const { url } = await res.json();
      window.location.assign(url);
    } catch {
      setLinkError("We couldn't reach dripp. Check your connection and try again.");
      setLinking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {collectedCents > 0 && <CollectedBanner cents={collectedCents} />}
      {linkedVerified !== null && (
        <GlassCard className="flex flex-col gap-3 p-5" role="status">
          {linkedVerified || verification.verified ? (
            <p className="flex items-center gap-2 font-bold">
              <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> Channel linked. You&apos;re verified.
            </p>
          ) : (
            <>
              <div>
                <p className="font-bold">Channel linked. One more step</p>
                <p className="text-caption text-muted">
                  Verify your phone so streamers can include you when they reward their viewers.
                </p>
              </div>
              <VerifyPhoneButton />
            </>
          )}
        </GlassCard>
      )}
      <GlassCard className="flex flex-col gap-4 p-6">
        {youtube ? (
          <div className="flex items-center gap-4">
            <span className="relative">
              <Avatar src={youtube.avatar_url} name={youtube.platform_username} className="h-12 w-12 text-title-2" />
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-brand text-text ring-2 ring-bg">
                <BadgeCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title-2">@{youtube.platform_username}</p>
              <p className="text-caption text-muted">Verified YouTube channel</p>
            </div>
            {!youtube.needs_relink && (
              <Button variant="outline" onClick={linkYoutube} loading={linking} className="!h-10 !px-4">
                Relink
              </Button>
            )}
          </div>
        ) : null}
        {youtube && !youtube.needs_relink && footer}
        {youtube?.needs_relink && (
          <div className="flex flex-col gap-3">
            <p className="text-muted">
              Link your channel again so tips keep reaching you, even if you change your handle.
            </p>
            <Button onClick={linkYoutube} loading={linking}>
              <Play className="h-5 w-5" aria-hidden /> Link YouTube again
            </Button>
          </div>
        )}
        {youtube ? null : (
          <>
            <div>
              <h2 className="text-title-2">Link your channel</h2>
              <p className="mt-1 text-muted">{blurb}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={linkYoutube} loading={linking}>
                <Play className="h-5 w-5" aria-hidden /> Link YouTube
              </Button>
              <Button variant="secondary" disabled title="Coming soon">
                Kick (coming soon)
              </Button>
            </div>
          </>
        )}
        {linkError && (
          <p className="text-caption text-negative" role="alert">
            {linkError}
          </p>
        )}
      </GlassCard>
    </div>
  );
}
