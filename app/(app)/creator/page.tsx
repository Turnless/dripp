"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, MonitorPlay, Users } from "lucide-react";
import { useAccount } from "@/components/account";
import { ChannelCard } from "@/components/LinkChannel";
import { BulkSendSheet } from "@/components/send/BulkSendSheet";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stagger, StaggerItem, springs } from "@/components/motion";

/** Creator mode. design.md section 9, screens 9, 10 and 14. */
export default function CreatorPage() {
  const { links } = useAccount();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const youtube = links.find((l) => l.platform === "youtube");
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
        />
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
