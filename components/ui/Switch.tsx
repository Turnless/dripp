"use client";

import { motion, useReducedMotion } from "motion/react";

/** On/off switch whose knob springs across (design.md 6: settle with a little bounce). */
export function SwitchTrack({ on, busy = false }: { on: boolean; busy?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span
      aria-hidden
      className={`relative flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors duration-200 ${
        on ? "justify-end bg-primary" : "justify-start bg-text/15"
      } ${busy ? "opacity-60" : ""}`}
    >
      <motion.span
        layout={!reduce}
        transition={{ type: "spring", bounce: 0.3, duration: 0.35 }}
        className={`h-6 w-6 rounded-full shadow transition-colors duration-200 ${on ? "bg-brand" : "bg-white"}`}
      />
    </span>
  );
}
