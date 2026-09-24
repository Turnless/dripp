"use client";

import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Avatar } from "@/components/ui/Avatar";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownToLine, ArrowRight, History, Plus, Send, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useSend } from "@/components/AppShell";
import { useAccount } from "@/components/account";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { AddMoneySheet } from "@/components/AddMoneySheet";
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
  const [addOpen, setAddOpen] = useState(false);
  const reduce = useReducedMotion();

  const balance = useBalance();
  // Phones and small laptops show the latest 5; wide screens have room for 8.
  const recent = useRecentWithWeek(8);
  const { user } = usePrivy();
  const firstName = user?.google?.name?.split(" ")[0];
  const activity = { data: recent.data?.items ?? null, error: recent.error };
  const balanceCents = balance.data ?? 0;

  const actions = [
    { label: "Send", icon: Send, onClick: openSend, primary: true },
    { label: "Add money", icon: Plus, onClick: () => setAddOpen(true) },
    { label: "Withdraw", icon: ArrowDownToLine, onClick: () => setWithdrawOpen(true) },
  ];

  return (
    <Stagger className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-x-8">
      <h1 className="sr-only lg:not-sr-only lg:text-title-1 xl:col-span-2">
        {firstName ? `Hi, ${firstName}` : "Money"}
      </h1>

      <div className="flex flex-col gap-6">
      <StaggerItem>
        <div className="relative overflow-hidden rounded-card bg-brand px-6 pb-6 pt-10 text-center shadow-[0_18px_40px_-18px_rgba(17,17,17,0.35)] lg:flex lg:items-center lg:justify-between lg:gap-8 lg:p-8 lg:text-left">
          <div>
          <p className="relative text-caption text-on-brand">Available</p>
          <p className="relative mt-2 text-money">
            {balance.data === null ? (
              balance.error ? (
                <span className="text-on-brand">$—</span>
              ) : (
                <Skeleton className="mx-auto h-[0.9em] w-48 rounded-2xl bg-text/10 lg:mx-0" />
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
          </div>
          <div className="relative mt-8 grid grid-cols-3 gap-2 sm:gap-3 lg:mt-0 lg:flex lg:w-[200px] lg:shrink-0 lg:flex-col lg:gap-2">
            {actions.map((a, i) => (
              <motion.button
                key={a.label}
                onClick={a.onClick}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.15 + i * 0.05 }}
                whileTap={{ scale: 0.96 }}
                className={`flex flex-col items-center gap-2 rounded-card px-2 py-4 text-caption font-semibold transition-colors lg:h-12 lg:flex-row lg:gap-3 lg:rounded-full lg:px-5 lg:py-0 lg:text-[0.9375rem] ${
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
        <StaggerItem className="xl:hidden">
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
              {activity.data.map((item, i) => (
                <StaggerItem as="li" key={item.id} className={i >= 5 ? "hidden xl:block" : undefined}>
                  <ActivityRow item={item} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </GlassCard>
      </StaggerItem>
      </div>

      {/* Desktop side column */}
      <div className="hidden flex-col gap-6 xl:sticky xl:top-10 xl:flex">
        {!(recent.error && !recent.data) && (
          <StaggerItem>
            <Spotlight items={recent.data?.items ?? null} week={recent.data?.week ?? null} weekShownElsewhere />
          </StaggerItem>
        )}
        <StaggerItem>
          <WeekCard week={recent.data?.week ?? null} />
        </StaggerItem>
        <StaggerItem>
          <TipAgainCard items={recent.data?.items ?? null} />
        </StaggerItem>
      </div>

      <WithdrawSheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} balanceCents={balanceCents} />
      <AddMoneySheet open={addOpen} onClose={() => setAddOpen(false)} />
    </Stagger>
  );
}

/** Desktop: the last 7 days at a glance. */
function WeekCard({ week }: { week: WeekSummary | null }) {
  const stats = [
    { label: "Received", value: week ? formatUsd(week.cents) : "—" },
    { label: "Tips", value: week ? String(week.count) : "—" },
    { label: "Supporters", value: week ? String(week.supporters) : "—" },
  ];
  return (
    <GlassCard className="p-5">
      <h2 className="font-bold">Last 7 days</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((s, i) => (
          <div key={s.label} className={`min-w-0 rounded-chip p-3 ${i === 0 ? "col-span-2 bg-brand" : "bg-text/[0.05]"}`}>
            <p
              className={`num truncate font-extrabold leading-none tracking-[-0.045em] ${
                i === 0 ? "text-[2rem]" : "text-[1.25rem]"
              }`}
            >
              {s.value}
            </p>
            <p className={`mt-1.5 text-caption ${i === 0 ? "text-on-brand" : "text-muted"}`}>{s.label}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/** Desktop: one-click tips to the people you tipped most recently. */
function TipAgainCard({ items }: { items: ActivityItem[] | null }) {
  const { openSend, openSendTo } = useSend();
  const people = useMemo(() => {
    const seen = new Map<string, NonNullable<ActivityItem["counterpartyPlatform"]>>();
    for (const i of items ?? []) {
      if (i.direction !== "sent" || i.status === "returned" || !i.counterparty) continue;
      if (!seen.has(i.counterparty)) seen.set(i.counterparty, i.counterpartyPlatform ?? "youtube");
    }
    return Array.from(seen, ([handle, platform]) => ({ handle, platform })).slice(0, 4);
  }, [items]);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Tip again</h2>
        <button type="button" onClick={openSend} className="text-caption font-semibold text-muted hover:text-text">
          Someone new
        </button>
      </div>
      {people.length === 0 ? (
        <p className="mt-3 text-caption text-muted">People you tip show up here for one-click tips.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {people.map((p) => (
            <li key={p.handle}>
              <button
                type="button"
                onClick={() => openSendTo({ platform: p.platform, handle: p.handle.replace(/^@/, "") })}
                className="pressable group flex w-full items-center gap-3 rounded-chip px-2 py-2 text-left hover:bg-text/[0.05]"
              >
                <Avatar src={null} name={p.handle.replace(/^@/, "")} className="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.handle}</span>
                <Send className="h-4 w-4 text-muted transition-colors group-hover:text-text" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
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
function Spotlight({
  items,
  week,
  weekShownElsewhere,
}: {
  items: ActivityItem[] | null;
  week: WeekSummary | null;
  /** Desktop shows the week in its own card, so the spotlight skips it. */
  weekShownElsewhere?: boolean;
}) {
  const { mode, links, verification, phoneVerifyAvailable } = useAccount();
  const { openSend, openSendTo } = useSend();
  const verifyPhone = useVerifyPhone();
  if (items === null) return <Skeleton className="h-[76px] w-full rounded-card" />;

  if (mode === "creator" && week && week.count > 0 && !weekShownElsewhere) {
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
        title="Get tipped and verified"
        body="Link your YouTube channel so people can tip you. No channel yet? Create one on YouTube first."
      />
    );
  }

  if (!verification.verified) {
    // Phone verification only once it's set up (Twilio); otherwise Profile
    // explains the other ways (YouTube, or a $1+ tip).
    return phoneVerifyAvailable ? (
      <>
        <SpotlightCard
          onClick={verifyPhone.start}
          icon={ShieldCheck}
          title="Verify to receive rewards"
          body="Streamers can include you when they reward their viewers."
        />
        {verifyPhone.sheet}
      </>
    ) : (
      <SpotlightCard
        href="/profile"
        icon={ShieldCheck}
        title="Get verified to receive rewards"
        body="Send a tip of $1 or more, or see other ways on your profile."
      />
    );
  }

  const last = items.find((i) => i.direction === "sent" && i.status !== "returned" && i.counterparty);
  if (last?.counterparty) {
    const handle = last.counterparty.replace(/^@/, "");
    return (
      <SpotlightCard
        onClick={() => openSendTo({ platform: last.counterpartyPlatform ?? "youtube", handle })}
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
