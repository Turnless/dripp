"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Droplet } from "lucide-react";
import { formatUsd } from "@/lib/format";

interface TipAlert {
  id: string;
  cents: number;
}

/**
 * OBS browser-source page. No navigation, no chrome -- just listens for
 * tip events over SSE and renders a brief alert. Add this page's URL as a
 * Browser Source in OBS (or any streaming software); it renders identically
 * regardless of which platform the streamer is broadcasting to, per the
 * "cross-platform overlay" design in 04-architecture.md.
 *
 * Styling is fixed (not theme-dependent) so it stays readable over any game
 * footage -- design.md section 9, screen 7.
 */
export default function OverlayPage({ params }: { params: { username: string } }) {
  const [alert, setAlert] = useState<TipAlert | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const reduce = useReducedMotion();

  useEffect(() => {
    const source = new EventSource(`/api/overlay/events/${encodeURIComponent(params.username)}`);

    source.onmessage = (event) => {
      const tip = JSON.parse(event.data);
      setAlert({ id: `${tip.created_at}-${Math.random()}`, cents: Math.round(Number(tip.amount) * 100) });
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setAlert(null), 6000);
    };

    return () => {
      source.close();
      clearTimeout(hideTimer.current);
    };
  }, [params.username]);

  return (
    <div className="flex h-screen w-screen items-end justify-center pb-16">
      <AnimatePresence>
        {alert && (
          <motion.div
            key={alert.id}
            // Enter and exit along the same path (design.md 6).
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 60, filter: "blur(10px)" }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", bounce: 0, duration: 0.45 }}
            className="flex items-center gap-5 rounded-sheet border border-white/15 px-8 py-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
            style={{
              background: "rgba(2, 26, 19, 0.82)",
              backdropFilter: "blur(24px) saturate(160%)",
              WebkitBackdropFilter: "blur(24px) saturate(160%)",
            }}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-primary">
              <Droplet className="h-7 w-7" strokeWidth={2.25} aria-hidden />
            </span>
            <div>
              <p className="text-lg font-medium text-white/80">New tip</p>
              <p className="num text-5xl font-semibold tracking-[-0.03em]">{formatUsd(alert.cents)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
