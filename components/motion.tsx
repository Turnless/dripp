"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion, type Variants } from "motion/react";
import { formatUsd } from "@/lib/format";

/*
 * dripp motion system (design.md section 6).
 *
 * - Springs, critically damped by default; `soft` (a little bounce) only for
 *   celebratory moments -- money arriving, a tip landing, a switch settling.
 * - Things enter from where they came from: forward steps from the right,
 *   back from the left; new items from above; sheets from the bottom.
 * - Nothing jumps: containers resize smoothly (AutoHeight), text swaps
 *   instead of blinking (Swap), numbers roll instead of changing (RollingNumber).
 * - Success is always the same mark: a drop falls and becomes a check (DropCheck).
 * - Every piece falls back to a plain fade with prefers-reduced-motion.
 */
// Motion tokens. Critically damped by default.
export const springs = {
  default: { type: "spring", bounce: 0, duration: 0.5 },
  snappy: { type: "spring", bounce: 0, duration: 0.3 },
  soft: { type: "spring", bounce: 0.2, duration: 0.6 },
} as const;

/** Fades + rises into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ ...springs.default, delay }}
    >
      {children}
    </Tag>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: springs.default },
};
const staggerChildReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

/** Children wrapped in <StaggerItem> appear one after another. */
export function Stagger({
  children,
  className,
  inView = false,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** true = start when scrolled into view; false = start on mount. */
  inView?: boolean;
  as?: "div" | "ul" | "ol";
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={staggerParent}
      initial="hidden"
      {...(inView
        ? { whileInView: "show", viewport: { once: true, margin: "-60px" } }
        : { animate: "show" })}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  layout = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
  /** Glide to a new position when items are added above (e.g. a new tip arrives). */
  layout?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={reduce ? staggerChildReduced : staggerChild}
      layout={layout && !reduce ? "position" : undefined}
      transition={layout ? springs.default : undefined}
    >
      {children}
    </Tag>
  );
}

/** Counts up from 0 to `value` when it scrolls into view (tabular numbers). */
export function CountUp({
  value,
  format = (v) => Math.round(v).toString(),
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [text, setText] = useState(format(reduce ? value : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setText(format(value));
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setText(format(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, duration]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {text}
    </span>
  );
}

/**
 * Headline that rises in word by word. Styles that must paint the glyphs
 * themselves (like .text-highlight, which paints a marker behind each word) go in
 * `wordClassName` -- they don't reach into the per-word inline blocks from
 * the outer span, and the words would render invisible.
 */
export function WordsIn({
  text,
  className,
  wordClassName = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span
            className={`inline-block ${wordClassName}`}
            initial={reduce ? { opacity: 0 } : { y: "105%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            transition={{ ...springs.default, delay: delay + i * 0.06 }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * A number that rolls from its previous value to the new one (the first
 * value counts up from 0). Unlike CountUp, a refresh never restarts at 0.
 */
export function RollingNumber({
  value,
  format = (v) => Math.round(v).toString(),
  duration = 0.9,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const shown = useRef(0);
  const [text, setText] = useState(format(reduce ? value : 0));

  useEffect(() => {
    if (reduce) {
      shown.current = value;
      return setText(format(value));
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        setText(format(v));
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);

  return <span className={`num ${className ?? ""}`}>{text}</span>;
}

/**
 * The "sent" mark: a yellow drop falls into the circle, splashes into two
 * rings, and the check draws itself. `pending` shows a clock instead.
 */
export function DropCheck({ pending = false }: { pending?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-primary text-on-primary">
        <CheckOrClock pending={pending} draw={false} />
      </span>
    );
  }
  return (
    <span className="relative grid h-[72px] w-[72px] place-items-center">
      {/* the drop */}
      <motion.svg
        viewBox="0 0 24 30"
        className="absolute left-1/2 top-1/2 h-9 w-7 -translate-x-1/2 -translate-y-1/2 text-primary"
        initial={{ y: -90, opacity: 1, scale: 1 }}
        animate={{ y: 0, opacity: 0, scale: 0.6 }}
        transition={{ y: { duration: 0.32, ease: [0.55, 0, 1, 0.45] }, opacity: { delay: 0.3, duration: 0.05 }, scale: { delay: 0.28, duration: 0.1 } }}
        aria-hidden
      >
        <path d="M12 29a9 9 0 0 0 9-9c0-2.6-1.3-5-3.9-7.1S12.5 7.8 12 1c-.6 6.8-3 9.8-5.1 11.9S3 17.4 3 20a9 9 0 0 0 9 9z" fill="currentColor" />
      </motion.svg>
      {/* splash rings */}
      {[0, 0.08].map((d) => (
        <motion.span
          key={d}
          className="absolute inset-0 rounded-full ring-2 ring-primary"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 0.5, 1.9], opacity: [0, 0.7, 0] }}
          transition={{ delay: 0.3 + d, duration: 0.6, times: [0, 0.02, 1], ease: "easeOut" }}
          aria-hidden
        />
      ))}
      <motion.span
        className="grid h-[72px] w-[72px] place-items-center rounded-full bg-primary text-on-primary"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring", bounce: 0.45, duration: 0.5 }}
      >
        <CheckOrClock pending={pending} draw />
      </motion.span>
    </span>
  );
}

function CheckOrClock({ pending, draw }: { pending: boolean; draw: boolean }) {
  const path = (d: string, delay: number) => (
    <motion.path
      d={d}
      initial={draw ? { pathLength: 0 } : false}
      animate={{ pathLength: 1 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
    />
  );
  return (
    <svg viewBox="0 0 24 24" className={pending ? "h-8 w-8" : "h-9 w-9"} fill="none" stroke="currentColor" strokeWidth={pending ? 2.4 : 3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {pending ? (
        <>
          <circle cx="12" cy="12" r="10" />
          {path("M12 6v6l4 2", 0.55)}
        </>
      ) : (
        path("M20 6 9 17l-5-5", 0.5)
      )}
    </svg>
  );
}

/**
 * Animates its height to fit its content, so a sheet or card grows and
 * shrinks smoothly when what's inside changes (a new step, an error line).
 * Only clips while it's moving, so focus rings and shadows aren't cut off.
 */
export function AutoHeight({ children, className }: { children: React.ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [height, setHeight] = useState<number | "auto">("auto");
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduce ? { duration: 0 } : springs.default}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => setMoving(false)}
      style={{ overflow: moving ? "hidden" : "visible" }}
    >
      <div ref={inner} className={className}>
        {children}
      </div>
    </motion.div>
  );
}

/**
 * Swaps its content with a short slide + fade whenever `id` changes, instead
 * of blinking (status lines, hints, labels).
 */
export function Swap({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={springs.snappy}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** An error line that slides in and gives a small shake each time the message changes. */
export function ErrorText({
  message,
  className = "",
  icon,
}: {
  message: string | null;
  className?: string;
  icon?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          key={message}
          role="alert"
          className={className}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: [0, -7, 7, -4, 4, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {icon}
          {icon ? " " : null}
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** 1 when a stepper moved forward, -1 when it moved back (for directional slides). */
export function useStepDirection(index: number) {
  const prev = useRef(index);
  const dir = index >= prev.current ? 1 : -1;
  useEffect(() => {
    prev.current = index;
  }, [index]);
  return dir;
}

/** Slide variants for a stepper; pass the direction as AnimatePresence/motion `custom`. */
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 28 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -28 * dir }),
};
export const stepVariantsReduced: Variants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

/** A single shine that sweeps across a surface once, a moment after it appears. */
export function Shine({ delay = 0.6 }: { delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
      initial={{ x: "-120%", skewX: -18 }}
      animate={{ x: "320%" }}
      transition={{ delay, duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
    />
  );
}

/** CountUp for dollar amounts in cents -- usable from server components (no function props). */
export function CountUpUsd({ cents, className }: { cents: number; className?: string }) {
  return <CountUp value={cents} format={(v) => formatUsd(Math.round(v))} className={className} />;
}
