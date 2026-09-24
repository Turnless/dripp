"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Check, Copy, MonitorPlay, Play, Users } from "lucide-react";
import { useAccount } from "@/components/account";
import { BulkSendSheet } from "@/components/send/BulkSendSheet";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stagger, StaggerItem, springs } from "@/components/motion";
import { useAuthedFetch, readError } from "@/lib/hooks";
import { announceMoneyChanged } from "@/lib/money-client";
import { formatUsd } from "@/lib/format";

// Messages for `?link_error=` from the platform-link callback route.
const LINK_ERRORS: Record<string, string> = {
  cancelled: "Linking was cancelled. You can try again any time.",
  expired: "That link attempt expired. Please try again.",
  not_verified: "We couldn't verify your YouTube account. Please try again.",
  no_channel: "That Google account doesn't have a YouTube channel with a handle. Pick the account that owns your channel.",
  unavailable: "Linking that platform isn't available yet.",
  failed: "We couldn't link your channel. Please try again.",
};

/** Creator mode. design.md section 9, screens 9, 10 and 14. */
export default function CreatorPage() {
  const { links } = useAccount();
  const authedFetch = useAuthedFetch();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  // Set by the platform-link callback when escrowed tips were released.
  const [collectedCents, setCollectedCents] = useState(0);
  useEffect(() => {
    setOrigin(window.location.origin);
    const search = new URLSearchParams(window.location.search);
    const collected = Number(search.get("collected"));
    if (collected > 0) {
      setCollectedCents(collected);
      announceMoneyChanged();
    }
    const error = search.get("link_error");
    if (error) setLinkError(LINK_ERRORS[error] ?? LINK_ERRORS.failed);
    if (collected > 0 || error) window.history.replaceState(null, "", "/creator");
  }, []);

  const youtube = links.find((l) => l.platform === "youtube");
  const overlayUrl = youtube ? `${origin}/overlay/${youtube.platform_username}?platform=youtube` : null;

  async function linkYoutube() {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await authedFetch("/api/platform/link/youtube", { method: "POST" });
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

  async function copyOverlay() {
    if (!overlayUrl) return;
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-title-1">Creator</h1>
      </StaggerItem>

      {collectedCents > 0 && (
        <StaggerItem>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springs.soft}
            className="bg-brand-gradient relative overflow-hidden rounded-card p-6 text-white shadow-primary"
          >
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
            <p className="relative text-caption text-white/80">Tips that were waiting for you</p>
            <p className="num relative mt-1 text-[2.75rem] font-semibold leading-none tracking-[-0.03em]">
              +{formatUsd(collectedCents)}
            </p>
            <p className="relative mt-2 text-white/90">Collected. It&apos;s in your balance now.</p>
          </motion.div>
        </StaggerItem>
      )}

      {/* Channel */}
      <StaggerItem>
        <GlassCard className="flex flex-col gap-4 p-6">
          {youtube ? (
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white">
                <BadgeCheck className="h-6 w-6" strokeWidth={1.9} aria-hidden />
              </span>
              <div>
                <p className="text-title-2">@{youtube.platform_username}</p>
                <p className="text-caption text-muted">Verified YouTube channel</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-title-2">Link your channel</h2>
                <p className="mt-1 text-muted">
                  Get a verified badge and collect any tips people sent you before you joined.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={linkYoutube} loading={linking}>
                  <Play className="h-5 w-5" aria-hidden /> Link YouTube
                </Button>
                <Button variant="secondary" disabled title="Coming soon">
                  Kick (coming soon)
                </Button>
              </div>
              {linkError && (
                <p className="text-caption text-negative" role="alert">
                  {linkError}
                </p>
              )}
            </>
          )}
        </GlassCard>
      </StaggerItem>

      {/* Reward viewers (bulk send) */}
      <StaggerItem>
        <GlassCard className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-emphasis">
            <Users className="h-6 w-6" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="text-title-2">Reward your viewers</h2>
            <p className="mt-1 text-muted">
              Tip a list of people in one go, like everyone who subscribed tonight. Split a total or
              send the same amount to each.
            </p>
          </div>
          <Button onClick={() => setBulkOpen(true)} className="shrink-0">
            Send to many
          </Button>
        </GlassCard>
      </StaggerItem>

      {/* Stream alerts */}
      <StaggerItem>
        <GlassCard className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint text-emphasis">
              <MonitorPlay className="h-6 w-6" strokeWidth={1.9} aria-hidden />
            </span>
            <div>
              <h2 className="text-title-2">Tip alerts on stream</h2>
              <p className="mt-1 text-muted">
                In OBS, add a Browser Source and paste this link. Tips appear on screen as they
                arrive.
              </p>
            </div>
          </div>
          {overlayUrl ? (
            <div className="flex items-center gap-2 rounded-chip border border-text/10 bg-solid/60 p-1.5 pl-4">
              <code className="flex-1 truncate text-[0.875rem] text-muted">{overlayUrl}</code>
              <Button variant="secondary" onClick={copyOverlay} aria-label="Copy overlay link" className="!h-9 !px-3">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? "done" : "copy"}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={springs.snappy}
                    className="inline-flex items-center gap-1.5"
                  >
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </div>
          ) : (
            <p className="text-caption text-muted">Link your channel first to get your alert link.</p>
          )}
        </GlassCard>
      </StaggerItem>

      <BulkSendSheet open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </Stagger>
  );
}
