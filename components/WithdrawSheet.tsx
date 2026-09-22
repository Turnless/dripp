"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatUsd, parseUsdToCents } from "@/lib/format";
import { WITHDRAWAL_FEE_PERCENT, withdrawalFee } from "@/lib/fees";

/**
 * Withdraw -- the one place dripp charges a fee (design.md 7). The fee is
 * always shown as a full breakdown before anything is confirmed.
 *
 * TODO(Mercuryo offramp -- README "Deliberately left as TODOs"): the final
 * button stays disabled until withdrawals are wired up.
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
  const [amountText, setAmountText] = useState("");
  useEffect(() => {
    if (open) setAmountText("");
  }, [open]);

  const cents = parseUsdToCents(amountText) ?? 0;
  const { fee, receive } = withdrawalFee(cents);

  return (
    <Sheet open={open} onClose={onClose} title="Withdraw">
      <div className="flex flex-col gap-6 pt-2">
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
            className="num w-auto min-w-[1ch] bg-transparent text-money outline-none placeholder:text-muted/50"
          />
        </label>

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

        <p className="flex items-start gap-2 text-caption text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Sending and receiving tips is free. This is the only fee dripp charges, and only when
          you take money out.
        </p>

        <Button size="lg" fullWidth disabled>
          Withdrawals open soon
        </Button>
      </div>
    </Sheet>
  );
}
