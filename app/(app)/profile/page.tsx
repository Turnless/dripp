"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { HeartHandshake, LogOut, Radio, type LucideIcon } from "lucide-react";
import { useAccount, type Mode } from "@/components/account";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Stagger, StaggerItem, springs } from "@/components/motion";

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: "viewer", label: "Viewer", icon: HeartHandshake },
  { id: "creator", label: "Creator", icon: Radio },
];

/** Profile + settings. */
export default function ProfilePage() {
  const { user, logout } = usePrivy();
  const { mode, setMode } = useAccount();
  const [modeError, setModeError] = useState<string | null>(null);

  const name = user?.google?.name ?? "Your profile";
  const email = user?.google?.email;

  async function changeMode(m: Mode) {
    if (m === mode) return;
    setModeError(null);
    try {
      await setMode(m);
    } catch (e) {
      setModeError(e instanceof Error ? e.message : "Could not save that. Please try again.");
    }
  }

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-title-1">Profile</h1>
      </StaggerItem>

      <StaggerItem>
        <GlassCard className="flex items-center gap-4 p-5">
          <span className="bg-brand-gradient grid h-14 w-14 shrink-0 place-items-center rounded-full text-title-2 text-white shadow-primary">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-title-2">{name}</p>
            {email && <p className="truncate text-caption text-muted">{email}</p>}
          </div>
        </GlassCard>
      </StaggerItem>

      <StaggerItem className="flex flex-col gap-3">
        <h2 id="mode" className="px-1 text-title-2">
          I use dripp as a
        </h2>
        <Segmented labelledBy="mode" group="mode" value={mode ?? "viewer"} options={MODES} onChange={changeMode} />
        <p className="px-1 text-caption text-muted">
          Creators get a Creator tab for their channel, stream alerts and rewarding viewers. Everyone
          can send and receive tips either way.
        </p>
        {modeError && (
          <p className="px-1 text-caption text-negative" role="alert">
            {modeError}
          </p>
        )}
      </StaggerItem>

      <StaggerItem>
        <Button variant="ghost" onClick={logout}>
          <LogOut className="h-5 w-5" aria-hidden /> Sign out
        </Button>
      </StaggerItem>
    </Stagger>
  );
}

/** Segmented control with a sliding selection. */
function Segmented<T extends string>({
  labelledBy,
  group,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  group: string;
  value: T;
  options: { id: T; label: string; icon: LucideIcon }[];
  onChange: (v: T) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-1 rounded-full bg-deep/[0.05] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`pressable relative flex h-10 items-center justify-center gap-2 rounded-full text-[0.9375rem] font-semibold ${
              active ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-full bg-solid shadow-[0_1px_3px_rgba(32,0,82,0.1)]"
                transition={reduce ? { duration: 0 } : springs.snappy}
              />
            )}
            <o.icon className="relative h-4 w-4" aria-hidden />
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
