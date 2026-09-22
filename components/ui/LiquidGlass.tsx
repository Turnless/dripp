"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { springs } from "@/components/motion";

/**
 * A liquid-glass bar whose highlight follows the pointer (design.md 4 / 6).
 * Writes the pointer position into CSS variables -- no React re-render per move.
 */
export function LiquidBar({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType === "touch") return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={`liquid-glass liquid-interactive ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Hover state for a group of nav items: one glass lens that glides to
 * whichever item the pointer is over, and fades out when it leaves the group.
 */
export function useHoverLens(group: string) {
  // The lens stays on the last hovered item and just fades when the pointer
  // leaves, so re-entering glides from where it was instead of popping in.
  const [hovered, setHovered] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();

  const groupProps = { onPointerLeave: () => setVisible(false) };
  const itemProps = (id: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      setHovered(id);
      setVisible(true);
    },
    onFocus: () => {
      setHovered(id);
      setVisible(true);
    },
    onBlur: () => setVisible(false),
  });

  /** Render inside each item (which must be `relative`); only the hovered one draws. */
  const renderLens = (id: string) =>
    hovered === id ? (
      <motion.span
        layoutId={`lens-${group}`}
        aria-hidden
        className="liquid-pill absolute inset-0 rounded-full"
        initial={false}
        animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.92 }}
        transition={reduce ? { duration: 0 } : springs.snappy}
      />
    ) : null;

  return { groupProps, itemProps, renderLens };
}
