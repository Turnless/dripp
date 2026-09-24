"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { springs } from "@/components/motion";

/**
 * A brief message that floats at the top of the app and dismisses itself --
 * for things that happened in the background (e.g. tips returned to you).
 */
export function Notice({
  message,
  onDismiss,
  durationMs = 8000,
}: {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [message, onDismiss, durationMs]);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center lg:top-24">
      <AnimatePresence>
        {message && (
          <motion.div
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 }}
            transition={springs.default}
            className="glass-thick pointer-events-auto flex max-w-md items-start gap-3 rounded-card px-4 py-3 shadow-[0_18px_40px_rgba(32,0,82,0.18)]"
          >
            <p className="flex-1 text-[0.9375rem]">{message}</p>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="pressable -m-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
