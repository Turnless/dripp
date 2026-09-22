"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { springs } from "@/components/motion";
import { useSendTip } from "@/lib/money-client";
import { formatUsd, parseUsdToCents } from "@/lib/format";
import { MAX_BULK_RECIPIENTS, MAX_TIP_CENTS } from "@/lib/fees";

type Platform = "youtube" | "kick";
type Step = "who" | "amount" | "review" | "sending";
type SplitMode = "split" | "each";
type Result = { handle: string; status: "waiting" | "sending" | "sent" | "held" | "failed"; error?: string };

/** Pulls handles out of pasted text: commas, spaces or new lines; strips "@"; dedupes. */
function parseHandles(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((h) => h.trim().replace(/^@/, "").toLowerCase())
    .filter((h) => /^[a-z0-9._-]{1,100}$/.test(h));
}

/**
 * Bulk / rule-based send (PRD 7.2, design.md screen 14): a creator tips many
 * viewers in one action.
 *
 * Sends one gas-free tip per person, in order (prepare -> smart wallet ->
 * confirm, see lib/money-client.ts), so each result shows as it happens and
 * one bad username doesn't block the rest. Later: the bot-filter step from
 * PRD 8.5.
 */
export function BulkSendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sendTip = useSendTip();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("who");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [draft, setDraft] = useState("");
  const [handles, setHandles] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("split");
  const [amountText, setAmountText] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("who");
    setDraft("");
    setHandles([]);
    setAmountText("");
    setResults([]);
    setDone(false);
  }, [open]);

  function addFromDraft() {
    const next = Array.from(new Set([...handles, ...parseHandles(draft)])).slice(0, MAX_BULK_RECIPIENTS);
    setHandles(next);
    setDraft("");
  }

  const cents = parseUsdToCents(amountText) ?? 0;
  const n = handles.length;
  const each = splitMode === "split" ? (n ? Math.floor(cents / n) : 0) : cents;
  const total = each * n;
  const amountError =
    each > MAX_TIP_CENTS
      ? `Each person can get at most ${formatUsd(MAX_TIP_CENTS)}.`
      : cents > 0 && each < 1
        ? "That's less than a cent each. Try a bigger total."
        : null;
  const amountValid = cents > 0 && each >= 1 && !amountError;

  const sentCount = useMemo(() => results.filter((r) => r.status === "sent" || r.status === "held").length, [results]);

  async function sendAll() {
    setStep("sending");
    const initial: Result[] = handles.map((h) => ({ handle: h, status: "waiting" }));
    setResults(initial);
    for (let i = 0; i < handles.length; i++) {
      setResults((rs) => rs.map((r, j) => (j === i ? { ...r, status: "sending" } : r)));
      let next: Result;
      try {
        const status = await sendTip({ platform, toUsername: handles[i], amountUsd: each / 100 });
        next = { handle: handles[i], status: status === "pending" ? "held" : "sent" };
      } catch (e) {
        next = { handle: handles[i], status: "failed", error: e instanceof Error ? e.message : "Connection problem" };
      }
      setResults((rs) => rs.map((r, j) => (j === i ? next : r)));
    }
    setDone(true);
  }

  const title = { who: "Reward your viewers", amount: "How much?", review: "Review", sending: done ? "Done" : "Sending" }[step];

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
          transition={reduce ? { duration: 0.12 } : springs.snappy}
          className="flex flex-col gap-5 pt-2"
        >
          {step === "who" && (
            <>
              <div role="radiogroup" aria-label="Platform" className="grid grid-cols-2 gap-1 rounded-full bg-text/[0.05] p-1">
                {(["youtube", "kick"] as const).map((p) => (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={platform === p}
                    onClick={() => setPlatform(p)}
                    className={`pressable h-10 rounded-full text-[0.9375rem] font-semibold ${
                      platform === p ? "bg-solid text-text shadow-[0_1px_3px_rgba(15,14,26,0.1)]" : "text-muted"
                    }`}
                  >
                    {p === "youtube" ? "YouTube" : "Kick"}
                  </button>
                ))}
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-caption text-muted">
                  Add usernames. Paste a list, separated by commas, spaces or new lines.
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addFromDraft();
                    }
                  }}
                  onBlur={addFromDraft}
                  rows={3}
                  placeholder="@maya, @leo, @sam"
                  className="resize-none rounded-chip border border-text/15 bg-solid/60 p-3 outline-none focus:border-primary"
                />
              </label>

              <div className="flex min-h-10 flex-wrap gap-2" aria-live="polite">
                <AnimatePresence initial={false}>
                  {handles.map((h) => (
                    <motion.span
                      key={h}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={springs.snappy}
                      className="inline-flex h-9 items-center gap-1 rounded-full bg-tint pl-3 pr-1 text-[0.875rem] font-medium text-emphasis"
                    >
                      @{h}
                      <button
                        onClick={() => setHandles((hs) => hs.filter((x) => x !== h))}
                        aria-label={`Remove @${h}`}
                        className="grid h-7 w-7 place-items-center rounded-full hover:bg-primary/10"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>

              <p className="text-caption text-muted">
                {n} of {MAX_BULK_RECIPIENTS} people
              </p>

              <Button size="lg" fullWidth disabled={n === 0} onClick={() => setStep("amount")}>
                Continue
              </Button>
            </>
          )}

          {step === "amount" && (
            <>
              <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-1 rounded-full bg-text/[0.05] p-1">
                {(
                  [
                    ["split", "Split a total"],
                    ["each", "Same for each"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={splitMode === id}
                    onClick={() => setSplitMode(id)}
                    className={`pressable h-10 rounded-full text-[0.9375rem] font-semibold ${
                      splitMode === id ? "bg-solid text-text shadow-[0_1px_3px_rgba(15,14,26,0.1)]" : "text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center justify-center">
                <span className="sr-only">{splitMode === "split" ? "Total amount" : "Amount per person"}</span>
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

              <p className="text-center text-muted">
                {splitMode === "split" ? "Total, split between" : "For each of"} {n} {n === 1 ? "person" : "people"}
              </p>

              <div className="rounded-card border border-text/10 p-4 text-center">
                <p className="text-caption text-muted">Each person gets</p>
                <p className="num mt-1 text-title-1">{formatUsd(each)}</p>
                <p className="num mt-1 text-caption text-muted">Total {formatUsd(total)} · no fees</p>
              </div>

              <p className="min-h-5 text-center text-caption text-negative" role={amountError ? "alert" : undefined}>
                {amountError ?? ""}
              </p>

              <div className="flex gap-3">
                <Button variant="secondary" size="lg" onClick={() => setStep("who")} aria-label="Back">
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </Button>
                <Button size="lg" fullWidth disabled={!amountValid} onClick={() => setStep("review")}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === "review" && (
            <>
              <div className="text-center">
                <p className="text-muted">
                  {formatUsd(each)} each to {n} {n === 1 ? "person" : "people"}
                </p>
                <p className="num mt-2 text-money">{formatUsd(total)}</p>
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-card border border-text/10">
                {handles.map((h) => (
                  <li key={h} className="flex items-center justify-between border-b border-text/5 px-4 py-3 last:border-0">
                    <span>@{h}</span>
                    <span className="num text-muted">{formatUsd(each)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-muted">
                Tips are free. Anyone who hasn&apos;t joined dripp yet will get theirs when they sign up.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" size="lg" onClick={() => setStep("amount")} aria-label="Back">
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </Button>
                <Button size="lg" fullWidth onClick={sendAll}>
                  Send {formatUsd(total)}
                </Button>
              </div>
            </>
          )}

          {step === "sending" && (
            <>
              <p className="text-center text-muted" role="status">
                {done ? `Sent to ${sentCount} of ${n}.` : `Sending ${sentCount + 1} of ${n}...`}
              </p>
              <ul className="max-h-72 overflow-y-auto rounded-card border border-text/10">
                {results.map((r) => (
                  <li key={r.handle} className="flex items-center gap-3 border-b border-text/5 px-4 py-3 last:border-0">
                    <StatusIcon status={r.status} />
                    <span className="flex-1">
                      @{r.handle}
                      {r.error && <span className="block text-caption text-negative">{r.error}</span>}
                      {r.status === "held" && (
                        <span className="block text-caption text-muted">Held until they join</span>
                      )}
                    </span>
                    <span className="num text-muted">{formatUsd(each)}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" fullWidth disabled={!done} onClick={onClose}>
                Done
              </Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

function StatusIcon({ status }: { status: Result["status"] }) {
  if (status === "sending") return <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Sending" />;
  if (status === "sent" || status === "held")
    return (
      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={springs.soft}>
        <CheckCircle2 className="h-5 w-5 text-positive" aria-label="Sent" />
      </motion.span>
    );
  if (status === "failed") return <AlertCircle className="h-5 w-5 text-negative" aria-label="Failed" />;
  return <span className="h-5 w-5 rounded-full border-2 border-text/15" aria-label="Waiting" />;
}
