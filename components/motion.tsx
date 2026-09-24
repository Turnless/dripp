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
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className} variants={reduce ? staggerChildReduced : staggerChild}>
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
