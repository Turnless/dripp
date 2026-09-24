"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/misc";
import { useAuthedFetch, readError } from "@/lib/hooks";
import type { TipperBreakdown } from "@/app/api/creator/tippers/route";

type Segment = {
  key: "real" | "new" | "suspicious";
  label: string;
  detail: string;
  icon: LucideIcon;
  /** Status colors: good / neutral / critical. Never used for anything else here. */
  fill: string;
  ink: string;
};

const SEGMENTS: Segment[] = [
  {
    key: "real",
    label: "Look real",
    detail: "Verified a channel, or have a tipping history",
    icon: CheckCircle2,
    fill: "bg-positive",
    ink: "text-positive",
  },
  {
    key: "new",
    label: "New",
    detail: "Joined recently, not enough history yet",
    icon: Clock,
    fill: "bg-muted",
    ink: "text-muted",
  },
  {
    key: "suspicious",
    label: "Look suspicious",
    detail: "Joined minutes before tipping, in a group of new accounts",
    icon: AlertTriangle,
    fill: "bg-negative",
    ink: "text-negative",
  },
];

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/**
 * "Who's tipping you" (PRD 7.2 bot/real breakdown): of the people who tipped
 * this creator in the last 30 days, how many look real, are new, or look
 * like a swarm of throwaway accounts (lib/bot-check.ts). Counts only.
 */
export function TipperBreakdownCard() {
  const authedFetch = useAuthedFetch();
  const reduce = useReducedMotion();
  const [data, setData] = useState<TipperBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Segment["key"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/creator/tippers");
        if (!res.ok) throw new Error(await readError(res));
        const json = (await res.json()) as TipperBreakdown;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "We couldn't load this right now.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  const shown = SEGMENTS.filter((s) => (data?.[s.key] ?? 0) > 0);
  const focus = hovered ? SEGMENTS.find((s) => s.key === hovered) : null;

  return (
    <GlassCard className="flex flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title-2">Who&apos;s tipping you</h2>
        <p className="shrink-0 text-caption text-muted">
          Last {data?.windowDays ?? 30} days{data ? ` · ${data.total} ${data.total === 1 ? "person" : "people"}` : ""}
        </p>
      </div>

      {error ? (
        <p className="text-caption text-negative" role="alert">
          {error}
        </p>
      ) : !data ? (
        <div className="flex flex-col gap-3" aria-label="Loading">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : data.total === 0 ? (
        <p className="text-muted">No tips in the last {data.windowDays} days yet. Once people tip you, you&apos;ll see how many look real.</p>
      ) : (
        <>
          <p className="text-muted">
            <span className="num text-[2rem] font-extrabold leading-none tracking-[-0.045em] text-text">
              {pct(data.real, data.total)}%
            </span>{" "}
            look like real people
          </p>

          {/* One bar, part-to-whole. Segments are separated by a 2px gap. */}
          <div
            className="flex h-3 w-full gap-[2px]"
            role="img"
            aria-label={SEGMENTS.map((s) => `${s.label}: ${data[s.key]}`).join(", ")}
            onPointerLeave={() => setHovered(null)}
          >
            {shown.map((s, i) => (
              <motion.span
                key={s.key}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ type: "spring", bounce: 0, duration: 0.6, delay: reduce ? 0 : 0.08 * i }}
                onPointerEnter={() => setHovered(s.key)}
                style={{ flexGrow: data[s.key], transformOrigin: "left" }}
                className={`h-full min-w-[6px] basis-0 ${s.fill} ${i === 0 ? "rounded-l" : ""} ${
                  i === shown.length - 1 ? "rounded-r" : ""
                } ${hovered && hovered !== s.key ? "opacity-40" : ""} transition-opacity`}
              />
            ))}
          </div>
          <p className="min-h-5 text-caption text-muted" aria-live="polite">
            {focus
              ? `${focus.label}: ${data[focus.key]} ${data[focus.key] === 1 ? "person" : "people"} (${pct(data[focus.key], data.total)}%)`
              : "Tap or hover the bar for details."}
          </p>

          {/* Legend doubles as the table view: every number is written out. */}
          <ul className="flex flex-col divide-y divide-deep/5">
            {SEGMENTS.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-3 py-2.5"
                onPointerEnter={() => setHovered(s.key)}
                onPointerLeave={() => setHovered(null)}
              >
                <s.icon className={`h-5 w-5 shrink-0 ${s.ink}`} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{s.label}</span>
                  <span className="block text-caption text-muted">{s.detail}</span>
                </span>
                <span className="num shrink-0 text-right">
                  <span className="block font-extrabold">{data[s.key]}</span>
                  <span className="block text-caption text-muted">{pct(data[s.key], data.total)}%</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-caption text-muted">
            These are signals, not proof. Accounts that look suspicious are skipped by default when you
            reward your viewers, and you can always include them.
          </p>
        </>
      )}
    </GlassCard>
  );
}
