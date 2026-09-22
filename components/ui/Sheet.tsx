"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useMediaQuery } from "@/lib/hooks";

// design.md section 6 motion tokens.
const springDefault = { type: "spring", bounce: 0, duration: 0.35 } as const;
const springSheet = { type: "spring", bounce: 0.15, duration: 0.3 } as const;

/**
 * Bottom sheet on mobile, centered dialog on desktop (design.md 5.1 / 5.2).
 * Mobile sheets can be dragged down to dismiss; releasing with enough
 * downward speed or distance closes it, otherwise it springs back.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal to <body>: page transitions apply transform/filter, which would
  // otherwise trap position:fixed inside the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("input, button:not([data-close]), [tabindex]")
        ?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : isDesktop
      ? {
          initial: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
          animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
          exit: { opacity: 0, scale: 0.96, filter: "blur(8px)" },
          transition: springDefault,
        }
      : { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: springSheet };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
          <motion.div
            className="absolute inset-0"
            style={{ background: "var(--scrim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass-thick relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet lg:max-w-[440px] lg:rounded-sheet"
            drag={!isDesktop && !reduceMotion ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            {...panelMotion}
          >
            <div className="flex justify-center pt-2.5 lg:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-text/20" />
            </div>
            <div className="flex items-center justify-between px-6 pb-2 pt-3 lg:pt-5">
              <h2 className="text-title-2">{title}</h2>
              <button
                data-close
                onClick={onClose}
                aria-label="Close"
                className="pressable -mr-2 grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-text/5"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
