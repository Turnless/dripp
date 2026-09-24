"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownToLine, ArrowRight, History, Plus, Send, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useSend } from "@/components/AppShell";
import { useAccount } from "@/components/account";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ActivityRow } from "@/components/ActivityRow";
import { useVerifyPhone } from "@/components/VerificationCard";
import type { ActivityItem, WeekSummary } from "@/app/api/activity/route";
import { useBalance, useRecentWithWeek } from "@/lib/money-client";
import { CountUp, Stagger, StaggerItem, springs } from "@/components/motion";
import { formatUsd } from "@/lib/format";

/** Money (home). design.md section 9, screen 3. */
export default function MoneyPage() {
  const { openSend } = useSend();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const reduce = useReducedMotion();

  const balance = useBalance();
  const recent = useRecentWithWeek(5);
  const activity = { data: recent.data?.items ?? null, error: recent.error };
  const balanceCents = balance.data ?? 0;

  const actions = [
    { label: "Send", icon: Send, onClick: openSend, primary: true },
    { label: "Add money", icon: Plus, disabled: true },
    { label: "Withdraw", icon: ArrowDownToLine, onClick: () => setWithdrawOpen(true) },
  ];

  return (
    <Stagger className="flex flex-col gap-6">
      <h1 className="sr-only">Money</h1>

      <StaggerItem>
        <div className="relative overflow-hidden rounded-card bg-brand px-6 pb-6 pt-10 text-center shadow-[0_18px_40px_-18px_rgba(17,17,17,0.35)]">
          <p className="relative text-caption text-on-brand">Available</p>
          <p className="relative mt-2 text-money">
            {balance.data === null ? (
              balance.error ? (
                <span className="text-on-brand">$—</span>
              ) : (
                <Skeleton className="mx-auto h-[0.9em] w-48 rounded-2xl bg-text/10" />
              )
            ) : (
              <CountUp key={balance.data} value={balance.data} format={(v) => formatUsd(Math.round(v))} />
            )}
          </p>
          {balance.error && (
            <p className="relative mt-2 text-caption font-semibold text-text" role="alert">
              {balance.error}
            </p>
          )}
          <div className="relative mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {actions.map((a, i) => (
              <motion.button
                key={a.label}
                onClick={a.onClick}
                disabled={a.disabled}
                title={a.disabled ? "Coming soon" : undefined}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.15 + i * 0.05 }}
                whileTap={a.disabled ? undefined : { scale: 0.96 }}
                className={`flex flex-col items-center gap-2 rounded-card px-2 py-4 text-caption font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  a.primary ? "bg-primary text-on-primary shadow-primary hover:bg-primary-hover" : "bg-text/[0.08] hover:bg-text/[0.12]"
                }`}
              >
                <a.icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
                {a.label}
              </motion.button>
            ))}
          </div>
        </div>
      </StaggerItem>

      {!(recent.error && !recent.data) && (
        <StaggerItem>
          <Spotlight items={recent.data?.items ?? null} week={recent.data?.week ?? null} />
        </StaggerItem>
      )}

      <StaggerItem className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-title-2">Recent</h2>
          <Link
            href="/activity"
            className="text-caption font-semibold text-emphasis underline decoration-brand decoration-[3px] underline-offset-4 hover:decoration-text"
          >
            See all
          </Link>
        </div>
        <GlassCard className="overflow-hidden">
          {activity.data === null ? (
            <div className="flex flex-col gap-3 p-4" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activity.data.length === 0 ? (
            <EmptyState
              icon={History}
              title="No tips yet. When you send or receive one, it shows up here."
              action={
                <Button variant="secondary" onClick={openSend}>
                  Send your first tip
                </Button>
              }
            />
          ) : (
            <Stagger as="ul" className="divide-y divide-deep/5">
              {activity.data.map((item) => (
                <StaggerItem as="li" key={item.id}>
                  <ActivityRow item={item} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </GlassCard>
      </StaggerItem>

      <WithdrawSheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} balanceCents={balanceCents} />
    </Stagger>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function ago(at: string): string {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / DAY_MS);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The card between the balance and Recent. Always there, showing the most
 * useful next thing: a creator's week, a way to get tipped, or a one-tap
 * repeat of your last tip.
 */
function Spotlight({ items, week }: { items: ActivityItem[] | null; week: WeekSummary | null }) {
  const { mode, links, verification } = useAccount();
  const { openSend, openSendTo } = useSend();
  const verifyPhone = useVerifyPhone();
  if (items === null) return <Skeleton className="h-[76px] w-full rounded-card" />;

  if (mode === "creator" && week && week.count > 0) {
    return (
      <Link href="/activity" className="group block">
        <div className="bg-brand-gradient flex items-center gap-4 rounded-card p-5 text-white transition-transform duration-300 group-hover:-translate-y-0.5">
          <span className="flex-1">
            <span className="block font-bold">This week</span>
            <span className="block text-caption text-white/70">
              {week.count} {week.count === 1 ? "tip" : "tips"} received
            </span>
          </span>
          <span className="num text-[1.75rem] font-extrabold leading-none tracking-[-0.045em] text-brand">
            {formatUsd(week.cents)}
          </span>
        </div>
      </Link>
    );
  }

  if (mode === "creator") {
    return (
      <SpotlightCard
        href="/creator"
        icon={Users}
        title="Reward your viewers"
        body="Send tips to many people at once"
      />
    );
  }

  if (links.length === 0) {
    return (
      <SpotlightCard
        href="/profile"
        icon={ArrowRight}
        title="Get tipped too"
        body="Link your YouTube channel so people can tip you."
      />
    );
  }

  if (!verification.verified) {
    return (
      <>
        <SpotlightCard
          onClick={verifyPhone.start}
          icon={ShieldCheck}
          title="Verify to receive rewards"
          body="Streamers can include you when they reward their viewers."
        />
        {verifyPhone.sheet}
      </>
    );
  }

  const last = items.find((i) => i.direction === "sent" && i.status !== "returned" && i.counterparty);
  if (last?.counterparty) {
    const handle = last.counterparty.replace(/^@/, "");
    return (
      <SpotlightCard
        onClick={() => openSendTo({ platform: "youtube", handle })}
        icon={Send}
        title={`Tip ${last.counterparty} again`}
        body={`Your last tip was ${formatUsd(last.cents)}, ${ago(last.at)}.`}
      />
    );
  }

  return <SpotlightCard onClick={openSend} icon={Send} title="Tip a creator" body="It arrives in about a second." />;
}

function SpotlightCard({
  href,
  onClick,
  icon: Icon,
  title,
  body,
}: {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  const card = (
    <GlassCard className="flex items-center gap-4 p-5 text-left transition-transform duration-300 group-hover:-translate-y-0.5">
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-caption text-muted">{body}</span>
      </span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-text transition-transform group-hover:translate-x-0.5">
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
    </GlassCard>
  );
  return href ? (
    <Link href={href} className="group block">
      {card}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className="group block w-full">
      {card}
    </button>
  );
}
