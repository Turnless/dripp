"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  CircleHelp,
  Droplet,
  ListOrdered,
  Plus,
  Receipt,
  Sparkles,
  CreditCard,
  Hourglass,
  MonitorPlay,
  Send,
  Timer,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Wordmark } from "@/components/ui/misc";
import { LiquidBar, useHoverLens } from "@/components/ui/LiquidGlass";
import { CountUp, Reveal, Stagger, StaggerItem, WordsIn, springs } from "@/components/motion";
import { formatUsd } from "@/lib/format";
import { WITHDRAWAL_FEE_BPS, WITHDRAWAL_FEE_PERCENT, withdrawalFee } from "@/lib/fees";

// ---------- content (plain English; every claim must be true of the product) ----------

const DEMO_TIPS = [
  { name: "maya", cents: 500, note: "great stream" },
  { name: "leo_plays", cents: 2000, note: "" },
  { name: "sam", cents: 100, note: "first time here" },
  { name: "kira", cents: 1000, note: "that clutch" },
  { name: "dev.j", cents: 300, note: "" },
  { name: "nora", cents: 5000, note: "keep going" },
];

const FEATURES: { icon: LucideIcon; title: string; body: string; tag: string }[] = [
  {
    icon: AtSign,
    title: "Tip by username",
    body: "Type a YouTube or Kick username and send. No bank details, no payment links to copy.",
    tag: "Sending",
  },
  {
    icon: Timer,
    title: "Arrives in about a second",
    body: "The creator's balance updates almost instantly. No waiting days for money to clear.",
    tag: "Speed",
  },
  {
    icon: Hourglass,
    title: "Tips wait for creators",
    body: "If a creator isn't on dripp yet, we hold their tips until they join and link their channel.",
    tag: "Creators",
  },
  {
    icon: MonitorPlay,
    title: "Alerts on stream",
    body: "One link in OBS and every tip pops up on screen the moment it lands.",
    tag: "Streaming",
  },
  {
    icon: BadgeCheck,
    title: "Verified creators",
    body: "Creators prove they own their channel, so supporters know the money reaches the right person.",
    tag: "Trust",
  },
  {
    icon: Users,
    title: "Reward your viewers",
    body: "Creators can tip a whole list of viewers at once, like everyone who subscribed tonight.",
    tag: "Community",
  },
];

const STEPS = [
  { icon: UserRound, title: "Sign in with Google", body: "No passwords to create and nothing to install." },
  { icon: CreditCard, title: "Add money", body: "Top up with a card, Apple Pay or Google Pay." },
  { icon: Send, title: "Send a tip", body: "Pick a username and an amount. It arrives in about a second." },
];

const AUDIENCES = {
  viewers: [
    "Tip any creator on YouTube or Kick, even if they've never heard of dripp.",
    "Tips are free. The creator gets every cent you send.",
    "See every tip you've sent in one place.",
  ],
  creators: [
    "Collect tips people sent you before you even joined.",
    "Show tip alerts on stream with one link in OBS.",
    "Reward your community by tipping many viewers at once.",
    `Cash out whenever you like. The only fee is ${WITHDRAWAL_FEE_PERCENT}, and only then.`,
  ],
};

// Facts about today's tipping come from docs/01 and docs/03.
const WHY = [
  {
    image: "/images/creator-headphones.jpg",
    alt: "A streamer wearing a headset, facing a bright gaming monitor",
    title: "Payouts that wait",
    subtitle: "Twitch pays out at $100",
    meta: ["Payouts", "Thresholds"],
    body: "Twitch holds your earnings until you reach $100. Smaller creators can wait months for their first payout.",
    answer: "On dripp, a tip is in your balance in about a second.",
  },
  {
    image: "/images/creator-mic.jpg",
    alt: "A creator with headphones speaking into a studio microphone",
    title: "Fees that eat tips",
    subtitle: "About 30¢ per card payment",
    meta: ["Card fees", "Small tips"],
    body: "Card payments usually carry a fixed fee of around 30 cents, so a $1 tip can lose close to a third on the way.",
    answer: `On dripp, tips are free. You pay ${WITHDRAWAL_FEE_PERCENT} only when you withdraw.`,
  },
  {
    image: "/images/creator-desk.jpg",
    alt: "A smiling creator with headphones recording at a desk",
    title: "Tips that go nowhere",
    subtitle: "Creator hasn't signed up",
    meta: ["Sign-ups", "Lost tips"],
    body: "Most tip tools only work once the creator has signed up, so fans who want to give early simply can't.",
    answer: "On dripp, the tip waits for them until they join.",
  },
];

const FAQ = [
  {
    q: "Does the creator need a dripp account?",
    a: "No. You can tip any YouTube handle. We hold the tip, and the creator collects it when they sign up and link their channel.",
  },
  {
    q: "What does dripp cost?",
    a: `Sending and receiving tips is free. When you withdraw money from dripp, we charge ${WITHDRAWAL_FEE_PERCENT} of the amount, and you see the exact fee before you confirm.`,
  },
  {
    q: "How fast does a tip arrive?",
    a: "In about a second. The creator's balance updates right away, and if they use stream alerts, it shows up on screen too.",
  },
  {
    q: "How do stream alerts work?",
    a: "Creators get a personal link. Add it to OBS (or any streaming app) as a Browser Source, and tips appear on screen as they arrive.",
  },
  {
    q: "Which platforms are supported?",
    a: "YouTube is fully supported. Kick is coming soon.",
  },
];

// ---------- page ----------

export function Landing() {
  const { login } = usePrivy();
  const withdrawExample = 5000;
  const { fee, receive } = withdrawalFee(withdrawExample);

  return (
    <div className="bg-field min-h-dvh overflow-x-clip">
      <LandingNav onLogin={login} />
      <MobileLandingNav onLogin={login} />

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-32 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-40">
          <div>
            <h1 className="text-[clamp(2.7rem,7.2vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              <WordsIn text="Tip any creator." />
              <br />
              <WordsIn text="It arrives in a second." wordClassName="text-highlight" delay={0.2} />
            </h1>
            <Reveal delay={0.35}>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
                Send money to anyone on YouTube or Kick using just their username. They don&apos;t
                need an account first. If they haven&apos;t joined yet, their tips wait for them.
              </p>
            </Reveal>
            <Reveal delay={0.45}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" onClick={login}>
                  Get started <ArrowRight className="h-5 w-5" aria-hidden />
                </Button>
                <Button size="lg" variant="secondary" onClick={() => scrollTo("features")}>
                  See features
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex -space-x-3">
                  {WHY.map((w) => (
                    <span key={w.image} className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-bg">
                      <Image src={w.image} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                  ))}
                </div>
                <p className="text-caption text-muted">
                  Free to tip · Sign in with Google
                  <br />
                  Nothing to install
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.25}>
            <LiveDemo />
          </Reveal>
        </section>

        {/* Numbers */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <Stagger inView className="grid gap-4 sm:grid-cols-3">
            <Stat value={<>~<CountUp value={1} />s</>} label="for a tip to arrive" />
            <Stat value={<><CountUp value={0} />%</>} label="fee on tips. Creators get it all." />
            <Stat value={<><CountUp value={WITHDRAWAL_FEE_BPS / 100} />%</>} label="only when you withdraw. That's our only fee." />
          </Stagger>
        </section>

        {/* Features: live timeline */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24 sm:px-8">
          <SectionHeading
            eyebrow="Features"
            title="Everything a tip needs. Nothing it doesn't."
            center
          />
          <FeatureTimeline />
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24 sm:px-8">
          <SectionHeading eyebrow="How it works" title="Three steps. Under a minute." center />
          <div className="relative mt-14">
            <motion.span
              aria-hidden
              className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-[2px] origin-left rounded-full bg-gradient-to-r from-primary to-brand md:block"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
            <Stagger inView as="ol" className="grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <StaggerItem as="li" key={s.title} className="relative flex flex-col items-center text-center">
                  <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-brand text-text shadow-primary">
                    <s.icon className="h-6 w-6" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="mt-5 text-label uppercase text-emphasis">Step {i + 1}</span>
                  <h3 className="mt-2 text-title-2">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-muted">{s.body}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Viewers vs creators */}
        <section id="creators" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24 sm:px-8">
          <SectionHeading eyebrow="Who it's for" title="Built for both sides of the stream." />
          <Reveal className="mt-10">
            <AudienceSwitch />
          </Reveal>
        </section>

        {/* Why dripp: tab cards */}
        <section id="why" className="relative scroll-mt-28 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <SectionHeading eyebrow="Why dripp" title="Tipping today is slower and costlier than it should be." />
          </div>
          <WhyCards />
        </section>

        {/* Fees */}
        <section id="fees" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24 sm:px-8">
          <Reveal>
            <GlassCard level="thick" className="relative grid gap-10 overflow-hidden p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
              <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
              <div className="relative">
                <span className="text-label uppercase text-emphasis">Fees</span>
                <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
                  Tipping is free.
                  <br />
                  <span className="text-highlight">You only pay {WITHDRAWAL_FEE_PERCENT} when you withdraw.</span>
                </h2>
                <p className="mt-4 max-w-md leading-relaxed text-muted">
                  A $2 tip shouldn&apos;t lose part of itself on the way. So we don&apos;t charge
                  anything to send or receive tips. When you move money out of dripp, we take{" "}
                  {WITHDRAWAL_FEE_PERCENT}, and you see the exact amount before you confirm. No
                  monthly cost.
                </p>
              </div>
              <div className="relative flex flex-col justify-center gap-3 rounded-card border border-deep/10 bg-solid/70 p-6">
                <p className="text-caption text-muted">Example withdrawal</p>
                <FeeLine label="You withdraw" value={formatUsd(withdrawExample)} />
                <FeeLine label={`dripp fee (${WITHDRAWAL_FEE_PERCENT})`} value={formatUsd(fee)} muted />
                <div className="h-px bg-deep/10" />
                <FeeLine label="You receive" value={formatUsd(receive)} strong />
                <p className="mt-2 flex items-center gap-2 text-caption text-positive">
                  <BadgeCheck className="h-4 w-4" aria-hidden /> Sending a tip: always free
                </p>
              </div>
            </GlassCard>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24 sm:px-8">
          <FaqSection onLogin={login} />
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-8">
          <Reveal>
            <div className="bg-brand-gradient relative overflow-hidden rounded-sheet px-8 py-20 text-center text-white shadow-primary">
              <span aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
              <h2 className="relative text-[clamp(2rem,4.5vw,3rem)] font-semibold tracking-[-0.035em]">
                Send your first tip in under a minute.
              </h2>
              <p className="relative mx-auto mt-3 max-w-md text-white/80">
                Sign in with Google, pick a creator, and send.
              </p>
              <div className="relative mt-8">
                <button
                  onClick={login}
                  className="pressable inline-flex h-14 items-center gap-2 rounded-full bg-brand px-7 font-semibold text-text shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:brightness-105"
                >
                  Get started <ArrowRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <LandingFooter onLogin={login} />
    </div>
  );
}

// ---------- pieces ----------

function LandingFooter({ onLogin }: { onLogin: () => void }) {
  const reduce = useReducedMotion();
  const columns: { title: string; links: [string, string][] }[] = [
    {
      title: "Product",
      links: [
        ["features", "Features"],
        ["how", "How it works"],
        ["fees", "Fees"],
        ["faq", "FAQ"],
      ],
    },
    {
      title: "Creators",
      links: [
        ["creators", "Stream alerts"],
        ["creators", "Reward your viewers"],
        ["why", "Why dripp"],
      ],
    },
  ];

  return (
    <footer className="relative mt-4 border-t border-deep/10">
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.3fr_0.7fr_0.8fr_1.2fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs leading-relaxed text-muted">
              Tips for the creators you watch. Free to send, and they arrive in about a second.
            </p>
          </div>

          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-label uppercase text-emphasis">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {c.links.map(([id, label]) => (
                  <li key={label}>
                    <button
                      onClick={() => scrollTo(id)}
                      className="group inline-flex items-center gap-1 text-muted transition-colors hover:text-text"
                    >
                      {label}
                      <ArrowUpRight
                        className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="card-wash rounded-card p-6">
            <p className="font-semibold">Start tipping today</p>
            <p className="mt-1 text-caption text-muted">Sign in with Google. It takes under a minute.</p>
            <Button onClick={onLogin} fullWidth className="mt-5">
              Get started <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-deep/10 py-6 text-caption text-muted sm:flex-row">
          <span>&copy; {new Date().getFullYear()} dripp. All rights reserved.</span>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })}
            className="pressable inline-flex items-center gap-2 rounded-full bg-tint px-4 py-2 font-semibold text-emphasis hover:bg-brand/20"
          >
            Back to top <ArrowUpRight className="h-4 w-4 -rotate-45" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

const NAV_LINKS = [
  ["features", "Features"],
  ["how", "How it works"],
  ["why", "Why dripp"],
  ["fees", "Fees"],
  ["faq", "FAQ"],
] as const;

function LandingNav({ onLogin }: { onLogin: () => void }) {
  const lens = useHoverLens("landing-nav");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={springs.default}
      className="fixed inset-x-0 top-4 z-40 hidden justify-center px-4 md:flex"
    >
      <LiquidBar
        className={`flex w-full items-center justify-between rounded-full py-2 pl-5 pr-2 transition-[max-width,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          scrolled ? "max-w-4xl" : "max-w-5xl"
        }`}
      >
        <Wordmark />
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex" {...lens.groupProps}>
          {NAV_LINKS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              {...lens.itemProps(id)}
              className="pressable relative h-9 rounded-full px-3.5 text-[0.9375rem] font-medium text-muted transition-colors hover:text-text"
            >
              {lens.renderLens(id)}
              <span className="relative">{label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1" {...lens.groupProps}>
          <button
            onClick={onLogin}
            {...lens.itemProps("sign-in")}
            className="pressable relative hidden h-10 rounded-full px-4 text-[0.9375rem] font-semibold text-text sm:block"
          >
            {lens.renderLens("sign-in")}
            <span className="relative">Sign in</span>
          </button>
          <Button onClick={onLogin} className="!h-10">
            Get started
          </Button>
        </div>
      </LiquidBar>
    </motion.header>
  );
}

// Sections the mobile nav circle can show while scrolling (top = the hero).
const MOBILE_SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "top", label: "dripp", icon: Droplet },
  { id: "features", label: "Features", icon: Sparkles },
  { id: "how", label: "How it works", icon: ListOrdered },
  { id: "creators", label: "Who it's for", icon: Users },
  { id: "why", label: "Why dripp", icon: Zap },
  { id: "fees", label: "Fees", icon: Receipt },
  { id: "faq", label: "FAQ", icon: CircleHelp },
];

/**
 * Mobile landing nav. At the top of the page it's the full bar; once you
 * scroll it shrinks into a glass circle that shows the section you're in,
 * with a ring for how far down the page you are. Tapping the circle opens
 * the full nav; choosing a link (or tapping outside) folds it back.
 */
function MobileLandingNav({ onLogin }: { onLogin: () => void }) {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("top");
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
      const line = window.innerHeight * 0.4;
      let current = "top";
      for (const s of MOBILE_SECTIONS.slice(1)) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const section = MOBILE_SECTIONS.find((s) => s.id === active) ?? MOBILE_SECTIONS[0];
  const shape = open ? "panel" : scrolled ? "circle" : "bar";
  const morph = reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.5 } as const;
  const fade = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
      };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default md:hidden"
            style={{ background: "var(--scrim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springs.default}
        className="fixed inset-x-0 top-4 z-40 flex justify-center px-4 md:hidden"
      >
        <motion.div
          layout
          transition={morph}
          style={{ borderRadius: 28 }}
          className={`liquid-glass overflow-hidden ${
            shape === "circle" ? "h-14 w-14" : shape === "bar" ? "w-full max-w-5xl" : "w-full"
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {shape === "bar" && (
              <motion.div key="bar" {...fade} className="flex items-center justify-between py-2 pl-4 pr-2">
                <Wordmark />
                <Button onClick={onLogin} className="!h-10">
                  Get started
                </Button>
              </motion.div>
            )}

            {shape === "circle" && (
              <motion.button
                key="circle"
                {...fade}
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`Open menu. You're at: ${section.label}`}
                aria-expanded={false}
                className="relative grid h-14 w-14 place-items-center"
              >
                {/* How far down the page you are */}
                <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="28" cy="28" r="25" fill="none" stroke="rgb(var(--text) / 0.08)" strokeWidth="3" />
                  <motion.circle
                    cx="28"
                    cy="28"
                    r="25"
                    fill="none"
                    stroke="rgb(var(--text))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{ pathLength: progress }}
                  />
                </svg>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={section.id}
                    initial={reduce ? { opacity: 0 } : { y: 14, opacity: 0, scale: 0.6 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { y: -14, opacity: 0, scale: 0.6 }}
                    transition={reduce ? { duration: 0.1 } : springs.snappy}
                    className="grid h-9 w-9 place-items-center rounded-full bg-brand text-text"
                  >
                    <section.icon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            )}

            {shape === "panel" && (
              <motion.nav key="panel" {...fade} aria-label="Sections" className="flex flex-col gap-1 p-2">
                <div className="flex items-center justify-between py-1 pl-2">
                  <Wordmark />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="pressable grid h-10 w-10 place-items-center rounded-full bg-text/[0.06]"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {MOBILE_SECTIONS.slice(1).map((s, i) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduce ? { duration: 0 } : { ...springs.default, delay: 0.04 * i }}
                    onClick={() => {
                      setOpen(false);
                      scrollTo(s.id);
                    }}
                    className={`pressable flex h-12 items-center gap-3 rounded-2xl px-3 text-left font-semibold ${
                      active === s.id ? "bg-brand text-text" : "text-text hover:bg-text/[0.05]"
                    }`}
                  >
                    <s.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    {s.label}
                  </motion.button>
                ))}
                <div className="mt-1 grid grid-cols-2 gap-2 p-1">
                  <Button variant="outline" onClick={onLogin}>
                    Sign in
                  </Button>
                  <Button onClick={onLogin}>Get started</Button>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.header>
    </>
  );
}

/** Example stream-alert feed. Loops through sample tips to show how it feels. */
function LiveDemo() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setCount((c) => c + 1), 2400);
    return () => clearInterval(t);
  }, [reduce]);

  const visible = Array.from({ length: Math.min(count, 4) }, (_, i) => {
    const idx = count - 1 - i;
    return { ...DEMO_TIPS[idx % DEMO_TIPS.length], key: idx };
  });
  const total = Array.from({ length: count }, (_, i) => DEMO_TIPS[i % DEMO_TIPS.length].cents).reduce((a, b) => a + b, 0);

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <span aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-brand/25 blur-3xl" />
      <GlassCard level="thick" className="p-5" aria-label="Example of tips arriving during a stream">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative h-11 w-11 overflow-hidden rounded-full ring-2 ring-brand/40">
              <Image src="/images/creator-mic.jpg" alt="" fill sizes="44px" className="object-cover" />
            </span>
            <div>
              <p className="flex items-center gap-1 font-semibold leading-tight">
                @creator <BadgeCheck className="h-4 w-4 text-emphasis" aria-label="Verified" />
              </p>
              <p className="flex items-center gap-1.5 text-caption text-muted">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-negative/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-negative" />
                </span>
                Live now
              </p>
            </div>
          </div>
          <span className="rounded-full bg-deep/5 px-2.5 py-1 text-label uppercase text-muted">Example</span>
        </div>

        <div className="bg-brand-gradient mt-6 rounded-card p-4 text-center text-white">
          <p className="text-caption text-white/75">Tips this stream</p>
          <motion.p
            key={total}
            initial={reduce ? false : { y: 8, opacity: 0.4 }}
            animate={{ y: 0, opacity: 1 }}
            transition={springs.snappy}
            className="num mt-1 text-[2.5rem] font-extrabold leading-none tracking-[-0.045em] text-brand"
          >
            {formatUsd(total)}
          </motion.p>
        </div>

        <ul className="mt-4 flex h-[252px] flex-col gap-2 overflow-hidden">
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <motion.li
                key={t.key}
                layout
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={springs.default}
                className="flex items-center gap-3 rounded-chip bg-solid/80 p-3 shadow-[0_1px_2px_rgba(17,17,17,0.05)]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tint text-[0.875rem] font-semibold text-emphasis">
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">@{t.name}</span>
                  {t.note && <span className="block truncate text-caption text-muted">{t.note}</span>}
                </span>
                <span className="num font-semibold text-positive">+{formatUsd(t.cents)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </GlassCard>
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <StaggerItem>
      <GlassCard className="p-7">
        <p className="num text-[3.25rem] font-extrabold leading-none tracking-[-0.055em]">{value}</p>
        <p className="mt-3 text-muted">{label}</p>
      </GlassCard>
    </StaggerItem>
  );
}

function SectionHeading({ eyebrow, title, center }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <Reveal className={center ? "text-center" : ""}>
      <span className="inline-flex items-center gap-2 text-label uppercase text-emphasis">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> {eyebrow}
      </span>
      <h2
        className={`mt-3 max-w-2xl text-[clamp(2rem,4.6vw,3.15rem)] font-semibold leading-[1.06] tracking-[-0.04em] ${
          center ? "mx-auto" : ""
        }`}
      >
        {title}
      </h2>
    </Reveal>
  );
}

// ----- Features: a line down the middle that fills as you scroll; cards attach to it -----

function FeatureTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  return (
    <div ref={ref} className="relative mt-16">
      {/* Track + live fill. Left edge on mobile, centered on desktop. */}
      <span aria-hidden className="absolute bottom-0 left-[19px] top-0 w-[2px] rounded-full bg-deep/10 md:left-[calc(50%-1px)]" />
      <motion.span
        aria-hidden
        style={{ scaleY: reduce ? 1 : fill }}
        className="absolute bottom-0 left-[19px] top-0 w-[2px] origin-top rounded-full bg-gradient-to-b from-brand via-primary to-brand md:left-[calc(50%-1px)]"
      />
      <ol className="flex flex-col gap-10 md:gap-6">
        {FEATURES.map((f, i) => (
          <TimelineItem key={f.title} feature={f} index={i} side={i % 2 === 0 ? "left" : "right"} />
        ))}
      </ol>
    </div>
  );
}

function TimelineItem({
  feature: f,
  index,
  side,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
  side: "left" | "right";
}) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion();
  // "Active" while the item sits in the middle band of the screen.
  const active = useInView(ref, { margin: "-40% 0px -40% 0px" });
  const seen = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const fromX = side === "left" ? -48 : 48;

  const card = (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: fromX, scale: 0.94, filter: "blur(6px)" }}
      animate={seen ? { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" } : undefined}
      transition={springs.soft}
      whileHover={reduce ? undefined : { y: -4 }}
      className={`${side === "left" ? "card-wash" : "card-wash-alt"} relative rounded-card p-6 transition-shadow duration-300 md:p-7 ${
        active ? "shadow-[0_20px_50px_rgba(17,17,17,0.14)]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`grid h-11 w-11 place-items-center rounded-2xl transition-colors duration-300 ${
            active ? "bg-brand text-text shadow-primary" : "bg-tint text-emphasis"
          }`}
        >
          <f.icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
        </span>
        <span className="num text-label uppercase text-muted">
          {String(index + 1).padStart(2, "0")} · {f.tag}
        </span>
      </div>
      <h3 className="mt-5 text-title-2">{f.title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
    </motion.div>
  );

  // Connector from the card to the line.
  const connector = (
    <motion.span
      aria-hidden
      initial={{ scaleX: 0 }}
      animate={seen ? { scaleX: 1 } : undefined}
      transition={{ ...springs.default, delay: 0.1 }}
      className={`hidden h-[2px] w-10 bg-gradient-to-r md:block ${
        side === "left" ? "origin-right from-transparent to-brand" : "origin-left from-brand to-transparent"
      }`}
    />
  );

  const node = (
    <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center">
      <motion.span
        aria-hidden
        animate={active && !reduce ? { scale: [1, 1.9], opacity: [0.5, 0] } : { scale: 1, opacity: 0 }}
        transition={active && !reduce ? { duration: 1.4, repeat: Infinity, ease: "easeOut" } : { duration: 0.2 }}
        className="absolute inset-1 rounded-full bg-brand"
      />
      <motion.span
        animate={{ scale: active ? 1 : 0.7 }}
        transition={springs.snappy}
        className={`relative h-4 w-4 rounded-full border-[3px] border-white transition-colors duration-300 ${
          active || seen ? "bg-primary" : "bg-deep/20"
        } shadow-[0_0_0_4px_rgba(255,210,63,0.35)]`}
      />
    </span>
  );

  return (
    <li ref={ref} className="relative">
      {/* Mobile: node on the left line, card to the right */}
      <div className="flex items-start gap-4 md:hidden">
        <span className="mt-6">{node}</span>
        <div className="flex-1">{card}</div>
      </div>
      {/* Desktop: alternate sides of the center line */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="flex items-center justify-end">
          {side === "left" && (
            <>
              <div className="max-w-md flex-1">{card}</div>
              {connector}
            </>
          )}
        </div>
        {node}
        <div className="flex items-center">
          {side === "right" && (
            <>
              {connector}
              <div className="max-w-md flex-1">{card}</div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ----- Why dripp: tall photo cards with a folder-tab top edge -----

function WhyCards() {
  const reduce = useReducedMotion();
  const fan = [
    { rotate: -6, y: 28 },
    { rotate: 0, y: 0 },
    { rotate: 6, y: 28 },
  ];

  return (
    <div className="mt-14">
      {/* Shape used by every card: rounded rect whose top-right steps down like a folder tab. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <clipPath id="tab-card" clipPathUnits="objectBoundingBox">
            <path d="M0,0.06 Q0,0 0.08,0 L0.5,0 C0.565,0 0.565,0.058 0.63,0.058 L0.92,0.058 Q1,0.058 1,0.118 L1,0.94 Q1,1 0.92,1 L0.08,1 Q0,1 0,0.94 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Desktop: fanned, overlapping. Mobile: swipeable row. */}
      <div className="mx-auto flex max-w-6xl snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-10 pt-4 [scrollbar-width:none] sm:px-8 lg:justify-center lg:gap-0 lg:overflow-visible">
        {WHY.map((w, i) => (
          <motion.div
            key={w.title}
            className="relative w-[78%] shrink-0 snap-center sm:w-[46%] lg:-mx-3 lg:w-[340px]"
            style={{ zIndex: i === 1 ? 3 : 2 - Math.abs(i - 1) }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 80, rotate: 0 }}
            whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: fan[i].y, rotate: fan[i].rotate }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ ...springs.soft, delay: i * 0.1 }}
            whileHover={reduce ? undefined : { y: -12, rotate: 0, scale: 1.03, zIndex: 10 }}
          >
            <WhyCard item={w} index={i} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function WhyCard({ item, index }: { item: (typeof WHY)[number]; index: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    // drop-shadow follows the clipped shape (box-shadow would be cut off).
    <div className="[filter:drop-shadow(0_24px_40px_rgba(17,17,17,0.28))]">
      <article className="relative aspect-[3/4] w-full overflow-hidden text-white" style={{ clipPath: "url(#tab-card)" }}>
        <Image src={item.image} alt={item.alt} fill sizes="(min-width: 1024px) 340px, 80vw" className="object-cover" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/25 to-transparent" />
        <span aria-hidden className="absolute inset-0 bg-brand/10 mix-blend-multiply" />

        {/* Top-left label sits on the raised part of the tab */}
        <span className="absolute left-4 top-4 rounded-full bg-white/20 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] backdrop-blur-md">
          Problem {String(index + 1).padStart(2, "0")}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="text-[1.75rem] font-semibold uppercase leading-[1.02] tracking-[-0.02em]">{item.title}</h3>
          <p className="mt-1.5 text-[0.9375rem] text-white/80">{item.subtitle}</p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-2 text-caption text-white/70">
              {item.meta.map((m, i) => (
                <span key={m} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-white/60" aria-hidden />}
                  {m}
                </span>
              ))}
            </p>
            <motion.button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Hide details" : `Read more: ${item.title}`}
              whileTap={{ scale: 0.9 }}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-deep shadow-[0_8px_20px_rgba(0,0,0,0.3)]"
            >
              <motion.span animate={{ rotate: open ? 90 : 0 }} transition={springs.snappy}>
                {open ? <X className="h-5 w-5" aria-hidden /> : <ArrowUpRight className="h-5 w-5" aria-hidden />}
              </motion.span>
            </motion.button>
          </div>
        </div>

        {/* Details slide up over the photo */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
              transition={springs.default}
              className="absolute inset-x-3 bottom-24 rounded-[20px] border border-white/20 bg-deep/55 p-4 backdrop-blur-xl"
            >
              <p className="text-[0.9375rem] leading-relaxed text-white/90">{item.body}</p>
              <p className="mt-3 flex items-start gap-2 text-[0.9375rem] font-semibold">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                {item.answer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </article>
    </div>
  );
}

// ----- Audience switch with photo -----

function AudienceSwitch() {
  const [tab, setTab] = useState<keyof typeof AUDIENCES>("viewers");
  const reduce = useReducedMotion();
  return (
    <GlassCard className="grid overflow-hidden md:grid-cols-[1.1fr_1fr]">
      <div className="p-6 md:p-10">
        <div role="tablist" aria-label="Audience" className="inline-grid grid-cols-2 gap-1 rounded-full bg-deep/[0.05] p-1">
          {(["viewers", "creators"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`pressable relative h-10 rounded-full px-6 text-[0.9375rem] font-semibold ${
                tab === t ? "text-on-primary" : "text-muted hover:text-text"
              }`}
            >
              {tab === t && (
                <motion.span
                  layoutId="audience-pill"
                  className="bg-brand-gradient absolute inset-0 rounded-full shadow-primary"
                  transition={reduce ? { duration: 0 } : springs.snappy}
                />
              )}
              <span className="relative">{t === "viewers" ? "For viewers" : "For creators"}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={tab}
            role="tabpanel"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={springs.snappy}
            className="mt-8 flex flex-col gap-5"
          >
            {AUDIENCES[tab].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint text-emphasis">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="text-[1.0625rem] leading-relaxed">{line}</span>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>

      <div className="relative min-h-[280px]">
        <Image
          src="/images/stream-setup.jpg"
          alt="A streaming setup with a microphone and headset in front of a monitor"
          fill
          sizes="(min-width: 768px) 45vw, 100vw"
          className="object-cover"
        />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-deep/60 to-transparent" />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ ...springs.soft, delay: 0.3 }}
          className="glass absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-card p-4 sm:right-auto"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-text">
            <Zap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-caption text-muted">New tip from @kira</p>
            <p className="num text-title-2">+$10.00</p>
          </div>
        </motion.div>
      </div>
    </GlassCard>
  );
}

function FeeLine({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted" : ""} ${strong ? "text-title-2" : ""}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

// ----- FAQ: sticky intro on the left, numbered gradient cards on the right -----

function FaqSection({ onLogin }: { onLogin: () => void }) {
  // One open at a time; the first starts open so the section never looks empty.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
      <div className="lg:sticky lg:top-32 lg:self-start">
        <Reveal>
          <span className="inline-flex items-center gap-2 text-label uppercase text-emphasis">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> Questions
          </span>
          <h2 className="mt-3 text-[clamp(2rem,4.6vw,3.15rem)] font-semibold leading-[1.06] tracking-[-0.04em]">
            Questions,
            <br />
            <span className="text-highlight">answered.</span>
          </h2>
          <p className="mt-4 max-w-sm leading-relaxed text-muted">
            The short version: tips are free, they arrive in about a second, and creators
            don&apos;t need an account for you to support them.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="card-wash mt-8 flex items-center gap-4 rounded-card p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-text shadow-primary">
              <Zap className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Easier to just try it?</p>
              <p className="text-caption text-muted">Sign in with Google. Tipping is free.</p>
            </div>
            <Button onClick={onLogin} className="!h-10 shrink-0">
              Start
            </Button>
          </div>
        </Reveal>
      </div>

      <Stagger inView className="flex flex-col gap-3">
        {FAQ.map((f, i) => (
          <StaggerItem key={f.q}>
            <FaqItem
              index={i}
              q={f.q}
              a={f.a}
              open={open === i}
              onToggle={() => setOpen((o) => (o === i ? null : i))}
            />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function FaqItem({
  index,
  q,
  a,
  open,
  onToggle,
}: {
  index: number;
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  const panelId = `faq-panel-${index}`;
  return (
    <motion.div
      layout={!reduce}
      transition={springs.snappy}
      className={`${index % 2 === 0 ? "card-wash" : "card-wash-alt"} relative overflow-hidden rounded-card transition-shadow duration-300 ${
        open ? "shadow-[0_18px_44px_rgba(17,17,17,0.12)] ring-1 ring-text/15" : "hover:ring-1 hover:ring-text/10"
      }`}
    >
      {/* Soft glow that appears behind the open card */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand/25 blur-3xl"
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.6 }}
        transition={springs.default}
      />
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex w-full items-center gap-4 px-5 py-5 text-left sm:px-6"
      >
        <span
          className={`num grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[0.8125rem] font-semibold transition-colors duration-300 ${
            open ? "bg-brand text-text shadow-primary" : "bg-white/80 text-emphasis"
          }`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex-1 text-[1.0625rem] font-semibold">{q}</span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
            open ? "bg-deep text-white" : "bg-white/80 text-emphasis"
          }`}
        >
          {/* Plus turns into a cross */}
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={springs.snappy} className="grid place-items-center">
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : springs.snappy}
            className="relative overflow-hidden"
          >
            <p className="pb-6 pl-[4.25rem] pr-6 leading-relaxed text-muted sm:pl-[4.75rem]">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
