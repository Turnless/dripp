"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, Info } from "lucide-react";
import { isAddress } from "viem";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useAccount } from "@/components/account";
import { useWithdraw } from "@/lib/money-client";
import { formatUsd, parseUsdToCents } from "@/lib/format";
import { WITHDRAWAL_FEE_PERCENT, withdrawalFee } from "@/lib/fees";

/**
 * Withdraw -- the one place dripp charges a fee (design.md 7). The fee is
 * always shown as a full breakdown before anything is confirmed.
 *
 * Payouts to a bank or card wait on the offramp (Mercuryo -- README
 * "Deliberately left as TODOs"). Until then, accounts allowed by
 * lib/withdraw-access.ts can withdraw to a wallet address instead; for
 * everyone else the final button stays "open soon".
 */
export function WithdrawSheet({
  open,
  onClose,
  balanceCents,
}: {
  open: boolean;
  onClose: () => void;
  balanceCents: number;
}) {
  const { canWithdrawToAddress } = useAccount();
  const withdraw = useWithdraw();
  const [amountText, setAmountText] = useState("");
  const [destination, setDestination] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCents, setDoneCents] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmountText("");
    setDestination("");
    setError(null);
    setDoneCents(null);
  }, [open]);

  const cents = parseUsdToCents(amountText) ?? 0;
  const { fee, receive } = withdrawalFee(cents);
  const overBalance = cents > balanceCents;
  const addressOk = isAddress(destination.trim());
  const canSend = canWithdrawToAddress && cents > 0 && receive > 0 && !overBalance && addressOk && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await withdraw(cents / 100, destination.trim());
      setDoneCents(receive);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't reach dripp. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={doneCents === null ? "Withdraw" : "Withdrawn"}>
      {doneCents !== null ? (
        <Done cents={doneCents} onClose={onClose} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-6 pt-2"
        >
          <p className="text-center text-caption text-muted">Available {formatUsd(balanceCents)}</p>

          <label className="flex items-center justify-center">
            <span className="sr-only">Amount to withdraw in dollars</span>
            <span className="num text-money text-muted" aria-hidden>
              $
            </span>
            <input
              value={amountText}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d*(\.\d{0,2})?$/.test(v)) setAmountText(v);
              }}
              inputMode="decimal"
              placeholder="0"
              size={Math.max(1, amountText.length)}
              className="num w-auto min-w-[1ch] bg-transparent text-money caret-text outline-none placeholder:text-muted/40"
            />
          </label>

          {canWithdrawToAddress && (
            <label className="flex flex-col gap-2">
              <span className="text-caption text-muted">Send to wallet address (Monad)</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="0x..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-14 rounded-chip border border-text/15 bg-solid/40 px-4 font-mono text-[0.9375rem] outline-none placeholder:text-muted/60 focus:border-text"
              />
              {destination.trim() && !addressOk && (
                <span className="text-caption text-negative">That doesn&apos;t look like a wallet address.</span>
              )}
            </label>
          )}

          <dl className="flex flex-col gap-3 rounded-card border border-text/10 p-4 text-[0.9375rem]">
            <div className="flex justify-between">
              <dt>You withdraw</dt>
              <dd className="num">{formatUsd(cents)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>dripp fee ({WITHDRAWAL_FEE_PERCENT})</dt>
              <dd className="num">{formatUsd(fee)}</dd>
            </div>
            <div className="h-px bg-text/10" />
            <div className="flex justify-between font-semibold">
              <dt>You receive</dt>
              <dd className="num">{formatUsd(receive)}</dd>
            </div>
          </dl>

          {overBalance ? (
            <p className="flex items-start gap-2 text-caption text-negative" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> That&apos;s more than your balance.
            </p>
          ) : error ? (
            <p className="flex items-start gap-2 text-caption text-negative" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
            </p>
          ) : (
            <p className="flex items-start gap-2 text-caption text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {canWithdrawToAddress
                ? "Double-check the address: money sent to the wrong one can't be brought back."
                : "Sending and receiving tips is free. This is the only fee dripp charges, and only when you take money out."}
            </p>
          )}

          {canWithdrawToAddress ? (
            <Button type="submit" size="lg" fullWidth loading={sending} disabled={!canSend}>
              {cents > 0 ? `Withdraw ${formatUsd(cents)}` : "Withdraw"}
            </Button>
          ) : (
            <Button type="button" size="lg" fullWidth disabled>
              Withdrawals open soon
            </Button>
          )}
        </form>
      )}
    </Sheet>
  );
}

function Done({ cents, onClose }: { cents: number; onClose: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-brand px-6 pb-6 pt-8 text-center text-text">
      <motion.span
        initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.3, duration: 0.45 }}
        className="grid h-[72px] w-[72px] place-items-center rounded-full bg-primary text-on-primary"
      >
        <Check className="h-9 w-9" strokeWidth={3} aria-hidden />
      </motion.span>
      <p className="num mt-3 text-[3.25rem] font-extrabold leading-none tracking-[-0.05em]">{formatUsd(cents)}</p>
      <p className="font-semibold text-on-brand" role="status">
        On its way to your wallet.
      </p>
      <Button size="lg" fullWidth onClick={onClose} className="mt-4">
        Done
      </Button>
    </div>
  );
}
