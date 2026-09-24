"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Copy, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { useAccount } from "@/components/account";
import { ChannelCard } from "@/components/LinkChannel";
import { BulkSendSheet } from "@/components/send/BulkSendSheet";
import { TipperBreakdownCard } from "@/components/creator/TipperBreakdownCard";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stagger, StaggerItem, springs } from "@/components/motion";
import { useRecentWithWeek } from "@/lib/money-client";
import { formatUsd } from "@/lib/format";
import { useAuthedFetch } from "@/lib/hooks";
import type { CreatorStats } from "@/app/api/creator/stats/route";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Live subscriber count for the linked channel, refreshed every minute while the page is open. */
function useSubscribers(enabled: boolean) {
  const authedFetch = useAuthedFetch();
  const [subscribers, setSubscribers] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authedFetch("/api/creator/stats");
        if (!res.ok) return;
        const stats = (await res.json()) as CreatorStats;
        if (!cancelled) setSubscribers(stats.subscribers);
      } catch {}
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, authedFetch]);
  return subscribers;
}

/** Creator mode. design.md section 9, screens 9, 10 and 14. */
export default function CreatorPage() {
  const { links } = useAccount();
  const week = useRecentWithWeek(5).data?.week ?? null;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const youtube = links.find((l) => l.platform === "youtube");
  const subscribers = useSubscribers(!!youtube && !youtube.needs_relink);
  const overlayUrl = youtube ? `${origin}/overlay/${youtube.platform_username}?platform=youtube` : null;

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

      {/* Channel (and tips collected by a link that just finished) */}
      <StaggerItem>
        <ChannelCard
          page="creator"
          blurb="Get a verified badge and collect any tips people sent you before you joined."
          footer={
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Stat
                  value={subscribers === null ? "—" : compact.format(subscribers)}
                  label="Subscribers"
                  live={subscribers !== null}
                />
                <Stat value={week ? formatUsd(week.cents) : "—"} label="Tips this week" />
                <Stat value={week ? String(week.supporters) : "—"} label="Supporters this week" />
              </div>
              {youtube && (
                <Link
                  href={`/u/${youtube.platform_username}`}
                  target="_blank"
                  className="pressable flex items-center justify-between gap-3 rounded-chip bg-text/[0.05] px-4 py-3 hover:bg-text/[0.08]"
                >
                  <span className="min-w-0">
                    <span className="block text-caption font-bold">Your public page</span>
                    <span className="block truncate text-caption text-muted">
                      {origin.replace(/^https?:\/\//, "")}/u/{youtube.platform_username}
                    </span>
                  </span>
                  <ArrowUpRight className="h-5 w-5 shrink-0" aria-hidden />
                </Link>
              )}
            </div>
          }
        />
      </StaggerItem>

      {/* Bot/real breakdown of the last 30 days' tippers */}
      <StaggerItem>
        <TipperBreakdownCard />
      </StaggerItem>

      {/* Stream alerts */}
      <StaggerItem>
        <GlassCard className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-text">
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
            <div className="flex items-center gap-2 rounded-chip bg-text/[0.05] p-1.5 pl-4">
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

      {/* Reward viewers (bulk send) */}
      <StaggerItem>
        <div className="flex flex-col gap-4 rounded-card bg-brand p-6 text-text sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="text-title-2">Reward your viewers</h2>
            <p className="mt-1 text-on-brand">
              Tip a list of people in one go, like everyone who subscribed tonight. Split a total or
              send the same amount to each.
            </p>
          </div>
          <Button onClick={() => setBulkOpen(true)} className="shrink-0 self-start sm:self-auto">
            Start a group tip
          </Button>
        </div>
      </StaggerItem>

      <BulkSendSheet open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </Stagger>
  );
}

function Stat({ value, label, live }: { value: string; label: string; live?: boolean }) {
  return (
    <div className="min-w-0 rounded-chip bg-text/[0.05] p-3">
      <p className="num truncate text-[1.375rem] font-extrabold leading-none tracking-[-0.045em]">{value}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-caption leading-tight text-muted">
        {live && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-positive" aria-hidden />}
        {label}
      </p>
    </div>
  );
}
