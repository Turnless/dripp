"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownToLine, ArrowRight, History, Plus, Send, Users } from "lucide-react";
import { useSend } from "@/components/AppShell";
import { useAccount } from "@/components/account";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ActivityRow } from "@/components/ActivityRow";
import { useActivity, useBalance } from "@/lib/money-client";
import { CountUp, Stagger, StaggerItem, springs } from "@/components/motion";
import { formatUsd } from "@/lib/format";

/** Money (home). design.md section 9, screen 3. */
export default function MoneyPage() {
  const { openSend } = useSend();
  const { mode } = useAccount();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const reduce = useReducedMotion();

  const balance = useBalance();
  const activity = useActivity(5);
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
        <GlassCard level="thick" className="relative overflow-hidden px-6 pb-6 pt-10 text-center">
          {/* Soft light inside the balance card */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          <p className="relative text-caption text-muted">Available</p>
          <p className="relative mt-2 text-money">
            {balance.data === null ? (
              balance.error ? (
                <span className="text-muted">$—</span>
              ) : (
                <Skeleton className="mx-auto h-[0.9em] w-48 rounded-2xl" />
              )
            ) : (
              <CountUp key={balance.data} value={balance.data} format={(v) => formatUsd(Math.round(v))} />
            )}
          </p>
          {balance.error && (
            <p className="relative mt-2 text-caption text-negative" role="alert">
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
                  a.primary ? "bg-primary text-white shadow-primary hover:bg-primary-hover" : "bg-text/[0.04] hover:bg-text/[0.07]"
                }`}
              >
                <a.icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
                {a.label}
              </motion.button>
            ))}
          </div>
        </GlassCard>
      </StaggerItem>

      {mode === "creator" && (
        <StaggerItem>
          <Link href="/creator" className="group block">
            <GlassCard className="flex items-center gap-4 p-5 transition-transform duration-300 group-hover:-translate-y-0.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint text-emphasis">
                <Users className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">Reward your viewers</span>
                <span className="block text-caption text-muted">Send tips to many people at once</span>
              </span>
              <ArrowRight className="h-5 w-5 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
            </GlassCard>
          </Link>
        </StaggerItem>
      )}

      <StaggerItem className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-title-2">Recent</h2>
          <Link href="/activity" className="text-caption font-semibold text-emphasis hover:underline">
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
