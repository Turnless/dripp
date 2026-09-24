"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { History } from "lucide-react";
import { useSend } from "@/components/AppShell";
import { ActivityRow } from "@/components/ActivityRow";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Stagger, StaggerItem, springs } from "@/components/motion";
import { useActivity, type ActivityItem } from "@/lib/money-client";

const FILTERS = ["All", "Sent", "Received", "Waiting"] as const;
type Filter = (typeof FILTERS)[number];

const matches = (f: Filter, i: ActivityItem) =>
  f === "All" ||
  (f === "Sent" && (i.direction === "sent" || i.direction === "withdrawn")) ||
  (f === "Received" && (i.direction === "received" || i.direction === "added")) ||
  (f === "Waiting" && i.status === "waiting");

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
}

/** Activity. design.md section 9, screen 6. */
export default function ActivityPage() {
  const { openSend } = useSend();
  const [filter, setFilter] = useState<Filter>("All");
  const { data, error } = useActivity(100);
  const reduce = useReducedMotion();

  const groups = useMemo(() => {
    const out: { label: string; items: ActivityItem[] }[] = [];
    (data ?? []).filter((i) => matches(filter, i)).forEach((i) => {
      const label = dayLabel(i.at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(i);
      else out.push({ label, items: [i] });
    });
    return out;
  }, [data, filter]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-1">Activity</h1>

      <div role="tablist" aria-label="Filter activity" className="flex gap-1 self-start rounded-full bg-deep/[0.05] p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`pressable relative h-9 shrink-0 rounded-full px-4 text-[0.9375rem] font-semibold ${
              filter === f ? "text-on-primary" : "text-muted hover:text-text"
            }`}
          >
            {filter === f && (
              <motion.span
                layoutId="activity-filter"
                className="bg-brand-gradient absolute inset-0 rounded-full shadow-primary"
                transition={reduce ? { duration: 0 } : springs.snappy}
              />
            )}
            <span className="relative">{f}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="text-caption text-negative" role="alert">
          {error}
        </p>
      )}

      {data === null && !error ? (
        <GlassCard className="flex flex-col gap-3 p-4" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </GlassCard>
      ) : groups.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={History}
            title={
              filter === "Waiting"
                ? "Nothing waiting. Tips to people who haven't joined yet show up here."
                : "No tips yet. When you send or receive one, it shows up here."
            }
            action={
              <Button variant="secondary" onClick={openSend}>
                Send a tip
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <Stagger key={filter} className="flex flex-col gap-5">
          {groups.map((g) => (
            <StaggerItem key={g.label} className="flex flex-col gap-2">
              <h2 className="px-1 text-label uppercase text-muted">{g.label}</h2>
              <GlassCard className="overflow-hidden">
                <ul className="divide-y divide-deep/5">
                  {g.items.map((item) => (
                    <li key={item.id}>
                      <ActivityRow item={item} />
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
