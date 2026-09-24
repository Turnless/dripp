"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { CircleDollarSign, History, Radio, Send, UserRound, type LucideIcon } from "lucide-react";
import { SendFlow, type SendPrefill } from "@/components/send/SendFlow";
import { Wordmark } from "@/components/ui/misc";
import { useAccount } from "@/components/account";
import { springs } from "@/components/motion";
import { useAutoRefunds, useFinishUnconfirmedTips, type ReturnedTips } from "@/lib/money-client";
import { formatUsd } from "@/lib/format";
import { Notice } from "@/components/ui/Notice";
import { Avatar } from "@/components/ui/Avatar";

type SendContextValue = {
  openSend: () => void;
  /** Opens Send with a recipient already filled in (e.g. "Tip @x again"). */
  openSendTo: (to: SendPrefill) => void;
};
const SendContext = createContext<SendContextValue>({ openSend: () => {}, openSendTo: () => {} });
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
  const { mode, avatarUrl, username } = useAccount();
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
  const [prefill, setPrefill] = useState<SendPrefill | null>(null);
  const openSend = useCallback(() => {
    setPrefill(null);
    setSendOpen(true);
  }, []);
  const openSendTo = useCallback((to: SendPrefill) => {
    setPrefill(to);
    setSendOpen(true);
  }, []);
  const closeSend = useCallback(() => setSendOpen(false), []);
  const nav = navFor(mode);
  const name = user?.google?.name ?? "dripp";

  return (
    <SendContext.Provider value={{ openSend, openSendTo }}>
      <div className="bg-field min-h-dvh">
        {/* Desktop: a glass sidebar -- Send first, then the pages, then the account */}
        <aside className="fixed inset-y-4 left-4 z-30 hidden w-[248px] lg:block">
          <div className="liquid-glass flex h-full flex-col rounded-[28px] p-3">
            <Link href="/" aria-label="dripp, go to Money" className="pressable self-start px-3 pb-2 pt-3">
              <Wordmark />
            </Link>
            <button
              onClick={openSend}
              className="pressable mt-5 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[0.9375rem] font-semibold text-on-primary shadow-primary hover:bg-primary-hover"
            >
              <Send className="h-4 w-4" aria-hidden /> Send a tip
            </button>
            <nav aria-label="Main" className="mt-6 flex flex-col gap-1">
              {nav.map((item) => (
                <SideLink key={item.href} item={item} active={pathname === item.href} />
              ))}
            </nav>
            <Link
              href="/profile"
              className="pressable mt-auto flex items-center gap-3 rounded-[20px] p-2.5 hover:bg-text/[0.05]"
            >
              <Avatar src={avatarUrl} name={name} />
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-bold">{name}</span>
                {username && <span className="block truncate text-caption text-muted">@{username}</span>}
              </span>
            </Link>
          </div>
        </aside>

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

        <main className="px-4 pb-36 pt-4 lg:pb-12 lg:pl-[296px] lg:pr-10 lg:pt-10">
          <div className="mx-auto w-full max-w-[720px] lg:max-w-[1100px]">{children}</div>
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
                className="-my-5 grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-primary ring-4 ring-bg"
              >
                <Send className="h-6 w-6" strokeWidth={2} aria-hidden />
              </motion.button>
            </div>
            {nav.slice(Math.ceil(nav.length / 2)).map((item) => (
              <TabItem key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </nav>

        <SendFlow open={sendOpen} onClose={closeSend} prefill={prefill} />
        <Notice message={notice} onDismiss={clearNotice} />
      </div>
    </SendContext.Provider>
  );
}

/** Desktop sidebar link; the yellow highlight slides between items. */
function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 items-center gap-3 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors ${
        active ? "text-text" : "text-muted hover:bg-text/[0.05] hover:text-text"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-side-desktop"
          className="absolute inset-0 rounded-full bg-brand shadow-[0_6px_16px_rgba(17,17,17,0.12)]"
          transition={reduce ? { duration: 0 } : springs.snappy}
        />
      )}
      <item.icon className="relative h-5 w-5" strokeWidth={1.9} aria-hidden />
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
        active ? "text-text" : "text-muted"
      }`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-brand"
          transition={reduce ? { duration: 0 } : springs.snappy}
        />
      )}
      <item.icon className="relative h-5 w-5" strokeWidth={1.9} aria-hidden />
      <span className="relative">{item.label}</span>
    </Link>
  );
}
