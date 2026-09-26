"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "motion/react";

// Motion tokens -- design.md section 6. Critically damped by default.
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
