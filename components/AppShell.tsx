"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { CircleDollarSign, History, Radio, Send, UserRound, type LucideIcon } from "lucide-react";
import { SendFlow } from "@/components/send/SendFlow";
import { Wordmark } from "@/components/ui/misc";
import { LiquidBar, useHoverLens } from "@/components/ui/LiquidGlass";
import { useAccount } from "@/components/account";
import { springs } from "@/components/motion";
import { useAutoRefunds, useFinishUnconfirmedTips, type ReturnedTips } from "@/lib/money-client";
import { formatUsd } from "@/lib/format";
import { Notice } from "@/components/ui/Notice";
import { Avatar } from "@/components/ui/Avatar";

const SendContext = createContext<{ openSend: () => void }>({ openSend: () => {} });
export const useSend = () => useContext(SendContext);

type NavItem = { href: string; label: string; icon: LucideIcon };

// Specific labels, not "Home" (design.md 5.1). Creators get their tab first.
function navFor(mode: string | null): NavItem[] {
  const money = { href: "/", label: "Money", icon: CircleDollarSign };
  const creator = { href: "/creator", label: "Creator", icon: Radio };
  const activity = { href: "/activity", label: "Activity", icon: History };
  const profile = { href: "/profile", label: "Profile", icon: UserRound };
  return mode === "creator" ? [money, creator, activity, profile] : [money, activity, profile];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, avatarUrl } = useAccount();
  useFinishUnconfirmedTips();
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoRefunds(
    useCallback(({ cents, handles }: ReturnedTips) => {
      const who = handles.length === 1 ? handles[0] : handles.length ? "some people you tipped" : "someone you tipped";
      setNotice(`${formatUsd(cents)} is back in your balance. ${who} didn't join dripp within 30 days.`);
    }, [])
  );
  const { user } = usePrivy();
  const [sendOpen, setSendOpen] = useState(false);
  const openSend = useCallback(() => setSendOpen(true), []);
  const closeSend = useCallback(() => setSendOpen(false), []);
  const nav = navFor(mode);
  const lens = useHoverLens("app-nav");
  const name = user?.google?.name ?? "dripp";

  return (
    <SendContext.Provider value={{ openSend }}>
      <div className="bg-field min-h-dvh">
        {/* Desktop: floating glass command bar */}
        <header className="fixed inset-x-0 top-4 z-30 hidden justify-center px-6 lg:flex">
          <LiquidBar className="flex w-full max-w-[1040px] items-center justify-between rounded-full py-2 pl-5 pr-2">
            <Link href="/" aria-label="dripp, go to Money" className="pressable">
              <Wordmark />
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 rounded-full bg-deep/[0.04] p-1" {...lens.groupProps}>
              {nav.map((item) => (
                <NavPill
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  hoverProps={lens.itemProps(item.href)}
                  lens={lens.renderLens(item.href)}
                />
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <button
                onClick={openSend}
                className="pressable flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[0.9375rem] font-semibold text-white shadow-primary hover:bg-primary-hover"
              >
                <Send className="h-4 w-4" aria-hidden /> Send
              </button>
              <Link
                href="/profile"
                aria-label="Profile"
                className="pressable rounded-full"
              >
                <Avatar src={avatarUrl} name={name} />
              </Link>
            </div>
          </LiquidBar>
        </header>

        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
          <Wordmark />
          <Link
            href="/profile"
            aria-label="Profile"
            className="pressable rounded-full"
          >
            <Avatar src={avatarUrl} name={name} />
          </Link>
        </header>

        <main className="px-4 pb-36 pt-4 lg:px-8 lg:pb-16 lg:pt-32">
          <div className="mx-auto w-full max-w-[720px]">{children}</div>
        </main>

        {/* Mobile: floating tab bar with a raised Send button in the middle */}
        <nav
          aria-label="Main"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 lg:hidden"
        >
          <div className="liquid-glass flex items-center rounded-full p-1.5">
            {nav.slice(0, Math.ceil(nav.length / 2)).map((item) => (
              <TabItem key={item.href} item={item} active={pathname === item.href} />
            ))}
            <div className="flex w-16 shrink-0 justify-center">
              <motion.button
                onClick={openSend}
                aria-label="Send a tip"
                whileTap={{ scale: 0.92 }}
                transition={springs.snappy}
                className="-my-5 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-primary ring-4 ring-bg"
              >
                <Send className="h-6 w-6" strokeWidth={2} aria-hidden />
              </motion.button>
            </div>
            {nav.slice(Math.ceil(nav.length / 2)).map((item) => (
              <TabItem key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </nav>

        <SendFlow open={sendOpen} onClose={closeSend} />
        <Notice message={notice} onDismiss={clearNotice} />
      </div>
    </SendContext.Provider>
  );
}

/**
 * Desktop pill link. The active highlight slides between items; a glass lens
 * glides under whichever item is hovered.
 */
function NavPill({
  item,
  active,
  hoverProps,
  lens,
}: {
  item: NavItem;
  active: boolean;
  hoverProps: ReturnType<ReturnType<typeof useHoverLens>["itemProps"]>;
  lens: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      {...hoverProps}
      className={`relative flex h-9 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium transition-colors ${
        active ? "text-white" : "text-muted hover:text-text"
      }`}
    >
      {lens}
      {active && (
        <motion.span
          layoutId="nav-pill-desktop"
          className="bg-brand-gradient absolute inset-0 rounded-full shadow-primary"
          transition={reduce ? { duration: 0 } : springs.snappy}
        />
      )}
      <item.icon className="relative h-4 w-4" strokeWidth={1.9} aria-hidden />
      <span className="relative">{item.label}</span>
    </Link>
  );
}

function TabItem({ item, active }: { item: NavItem; active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`pressable relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[0.6875rem] font-semibold transition-colors ${
        active ? "text-emphasis" : "text-muted"
      }`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-tint"
          transition={reduce ? { duration: 0 } : springs.snappy}
        />
      )}
      <item.icon className="relative h-5 w-5" strokeWidth={1.9} aria-hidden />
      <span className="relative">{item.label}</span>
    </Link>
  );
}
