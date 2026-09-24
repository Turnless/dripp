"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthedFetch } from "@/lib/hooks";
import { useSendTip } from "@/lib/money-client";
import { formatUsd, parseUsdToCents } from "@/lib/format";
import { MAX_TIP_CENTS } from "@/lib/fees";

type Platform = "youtube" | "kick" | "dripp";
export type SendPrefill = { platform: Platform; handle: string };
type Step = "who" | "amount" | "review" | "sent";
type Lookup = "idle" | "checking" | "existing_user" | "verified_unclaimed" | "not_found" | "error";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "youtube", label: "YouTube" },
  { id: "kick", label: "Kick" },
  { id: "dripp", label: "dripp" },
];
const QUICK_AMOUNTS = [100, 200, 500, 1000];

const stepTransition = { type: "spring", bounce: 0, duration: 0.3 } as const;

export function SendFlow({
  open,
  onClose,
  prefill = null,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: SendPrefill | null;
}) {
  const [step, setStep] = useState<Step>("who");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [handle, setHandle] = useState("");
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [amountText, setAmountText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<"settled" | "pending">("settled");

  // Start fresh each time the sheet opens (with the recipient, if one was given).
  useEffect(() => {
    if (!open) return;
    setStep("who");
    if (prefill) setPlatform(prefill.platform);
    setHandle(prefill?.handle ?? "");
    setLookup("idle");
    setAmountText("");
    setSendError(null);
  }, [open, prefill]);

  const cleanHandle = handle.trim().replace(/^@/, "");
  const cents = parseUsdToCents(amountText);

  const title =
    step === "who" ? "Send a tip" : step === "amount" ? "How much?" : step === "review" ? "Review" : "Sent";

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <AnimatePresence mode="wait" initial={false}>
        <StepPane key={step}>
          {step === "who" && (
            <WhoStep
              platform={platform}
              setPlatform={(p) => {
                setPlatform(p);
                setLookup("idle");
              }}
              handle={handle}
              setHandle={setHandle}
              cleanHandle={cleanHandle}
              lookup={lookup}
              setLookup={setLookup}
              onNext={() => setStep("amount")}
            />
          )}
          {step === "amount" && (
            <AmountStep
              handle={cleanHandle}
              platformName={PLATFORMS.find((p) => p.id === platform)!.label}
              joined={lookup === "existing_user"}
              amountText={amountText}
              setAmountText={setAmountText}
              cents={cents}
              onBack={() => setStep("who")}
              onNext={() => {
                setSendError(null);
                setStep("review");
              }}
            />
          )}
          {step === "review" && cents !== null && (
            <ReviewStep
              platform={platform}
              handle={cleanHandle}
              joined={lookup === "existing_user"}
              cents={cents}
              sending={sending}
              error={sendError}
              onBack={() => setStep("amount")}
              setSending={setSending}
              setError={setSendError}
              onSent={(r) => {
                setResult(r);
                setStep("sent");
              }}
            />
          )}
          {step === "sent" && cents !== null && (
            <SentStep
              handle={cleanHandle}
              cents={cents}
              pending={result === "pending"}
              onDone={onClose}
              onAgain={() => {
                setAmountText("");
                setStep("amount");
              }}
            />
          )}
        </StepPane>
      </AnimatePresence>
    </Sheet>
  );
}

function StepPane({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
      transition={reduce ? { duration: 0.12 } : stepTransition}
      className="pt-2"
    >
      {children}
    </motion.div>
  );
}

/** "YouTube · On dripp", or just "dripp username" for a dripp username. */
function recipientDetail(platformName: string, joined: boolean) {
  if (platformName === "dripp") return "dripp username";
  return `${platformName} · ${joined ? "On dripp" : "Hasn't joined yet"}`;
}

// ---------- Step 1: who ----------

function WhoStep({
  platform,
  setPlatform,
  handle,
  setHandle,
  cleanHandle,
  lookup,
  setLookup,
  onNext,
}: {
  platform: Platform;
  setPlatform: (p: Platform) => void;
  handle: string;
  setHandle: (h: string) => void;
  cleanHandle: string;
  lookup: Lookup;
  setLookup: (l: Lookup) => void;
  onNext: () => void;
}) {
  const authedFetch = useAuthedFetch();
  const requestId = useRef(0);

  // Check the username as the user types (debounced), so they know before sending.
  useEffect(() => {
    if (!cleanHandle) {
      setLookup("idle");
      return;
    }
    setLookup("checking");
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ platform, username: cleanHandle });
        const res = await authedFetch(`/api/username/resolve?${qs}`);
        if (id !== requestId.current) return;
        if (!res.ok) return setLookup("error");
        const json = await res.json();
        setLookup(json.status as Lookup);
      } catch {
        if (id === requestId.current) setLookup("error");
      }
    }, 450);
    return () => clearTimeout(t);
  }, [cleanHandle, platform, authedFetch, setLookup]);

  const canContinue = lookup === "existing_user" || lookup === "verified_unclaimed";
  const platformName = PLATFORMS.find((p) => p.id === platform)!.label;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onNext();
      }}
      className="flex flex-col gap-5"
    >
      <div role="radiogroup" aria-label="Platform" className="glass-thin grid grid-cols-3 gap-1 rounded-full p-1">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={platform === p.id}
            onClick={() => setPlatform(p.id)}
            className={`pressable h-10 rounded-full text-[0.9375rem] font-semibold ${
              platform === p.id ? "bg-primary text-on-primary" : "text-muted hover:text-text"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-caption text-muted">{platformName} username</span>
        <div className="flex h-14 items-center gap-1 rounded-chip border border-text/15 bg-solid/40 px-4 focus-within:border-emphasis">
          <span className="text-lg text-muted" aria-hidden>
            @
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={100}
            className="h-full w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
          />
        </div>
      </label>

      <LookupStatus lookup={lookup} handle={cleanHandle} platformName={platformName} />

      <Button type="submit" size="lg" fullWidth disabled={!canContinue}>
        Continue
      </Button>
    </form>
  );
}

function LookupStatus({ lookup, handle, platformName }: { lookup: Lookup; handle: string; platformName: string }) {
  const row = "flex min-h-6 items-start gap-2 text-caption";
  switch (lookup) {
    case "checking":
      return (
        <p className={`${row} text-muted`} role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking...
        </p>
      );
    case "existing_user":
      return (
        <p className={`${row} text-emphasis`} role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> @{handle} is on dripp
        </p>
      );
    case "verified_unclaimed":
      return (
        <p className={`${row} text-muted`} role="status">
          <Clock className="h-4 w-4 shrink-0" aria-hidden /> @{handle} hasn&apos;t joined yet. We&apos;ll hold
          the tip until they do.
        </p>
      );
    case "not_found":
      return (
        <p className={`${row} text-negative`} role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> We can&apos;t find that username on{" "}
          {platformName}. Check the spelling.
        </p>
      );
    case "error":
      return (
        <p className={`${row} text-negative`} role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> We couldn&apos;t check that username
          right now. Try again in a moment.
        </p>
      );
    default:
      return <p className={row} aria-hidden />;
  }
}

// ---------- Step 2: amount ----------

function AmountStep({
  handle,
  platformName,
  joined,
  amountText,
  setAmountText,
  cents,
  onBack,
  onNext,
}: {
  handle: string;
  platformName: string;
  joined: boolean;
  amountText: string;
  setAmountText: (t: string) => void;
  cents: number | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const tooBig = cents !== null && cents > MAX_TIP_CENTS;
  const valid = cents !== null && cents >= 1 && !tooBig;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onNext();
      }}
      className="flex flex-col gap-5"
    >
      <Recipient handle={handle} detail={recipientDetail(platformName, joined)} />

      <label className="flex items-center justify-center py-2">
        <span className="sr-only">Amount in dollars</span>
        <span className="num text-[4rem] font-bold leading-none tracking-[-0.05em] text-muted" aria-hidden>
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
          className="num w-auto min-w-[1ch] bg-transparent text-[4rem] font-extrabold leading-none tracking-[-0.05em] caret-text outline-none placeholder:text-muted/40"
        />
      </label>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAmountText(String(c / 100))}
            aria-pressed={cents === c}
            className={`pressable num h-12 rounded-chip text-[0.9375rem] font-extrabold ${
              cents === c ? "bg-brand ring-[1.5px] ring-inset ring-text" : "bg-text/[0.05] hover:bg-text/[0.08]"
            }`}
          >
            {formatUsd(c).replace(".00", "")}
          </button>
        ))}
      </div>

      <p
        className={`min-h-5 text-center text-caption ${tooBig ? "text-negative" : "text-muted"}`}
        role={tooBig ? "alert" : undefined}
      >
        {tooBig
          ? `The most you can send at once is ${formatUsd(MAX_TIP_CENTS)}.`
          : valid
            ? `Free to send. @${handle} gets the full ${formatUsd(cents)}.`
            : "Sending a tip is always free."}
      </p>

      <div className="flex gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Button>
        <Button type="submit" size="lg" fullWidth disabled={!valid}>
          Review tip
        </Button>
      </div>
    </form>
  );
}

/** Who the tip is going to: initial, handle and platform. */
function Recipient({ handle, detail }: { handle: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-text/[0.04] p-3">
      <Avatar src={null} name={handle} className="h-10 w-10" />
      <div className="min-w-0">
        <p className="truncate font-bold">@{handle}</p>
        <p className="truncate text-caption text-muted">{detail}</p>
      </div>
    </div>
  );
}

// ---------- Step 3: review ----------

function ReviewStep({
  platform,
  handle,
  joined,
  cents,
  sending,
  error,
  onBack,
  setSending,
  setError,
  onSent,
}: {
  platform: Platform;
  handle: string;
  joined: boolean;
  cents: number;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  setSending: (s: boolean) => void;
  setError: (e: string | null) => void;
  onSent: (r: "settled" | "pending") => void;
}) {
  const sendTip = useSendTip();

  async function send() {
    setSending(true);
    setError(null);
    try {
      const status = await sendTip({ platform, toUsername: handle, amountUsd: cents / 100 });
      onSent(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't reach dripp. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Recipient handle={handle} detail={recipientDetail(PLATFORMS.find((p) => p.id === platform)!.label, joined)} />
      <p className="num text-center text-[3.5rem] font-extrabold leading-none tracking-[-0.05em]">{formatUsd(cents)}</p>

      <dl className="flex flex-col gap-3 rounded-card border border-text/10 p-4 text-[0.9375rem]">
        <Row label="You send" value={formatUsd(cents)} />
        <Row label="Fee" value="Free" muted />
        <div className="h-px bg-text/10" />
        <Row label={`@${handle} gets`} value={formatUsd(cents)} strong />
      </dl>

      {!joined && (
        <p className="flex items-start gap-2 text-caption text-muted">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          @{handle} hasn&apos;t joined yet. We&apos;ll hold this until they sign up and link their channel.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 text-caption text-negative" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} disabled={sending} aria-label="Back">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Button>
        <Button size="lg" fullWidth loading={sending} onClick={send}>
          Send {formatUsd(cents)}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={muted ? "text-muted" : ""}>{label}</dt>
      <dd className={`num ${muted ? "text-muted" : ""} ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

// ---------- Step 4: sent ----------

function SentStep({
  handle,
  cents,
  pending,
  onDone,
  onAgain,
}: {
  handle: string;
  cents: number;
  pending: boolean;
  onDone: () => void;
  onAgain: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    // One soft haptic on success, where supported (design.md 6.1).
    if (!reduce) navigator.vibrate?.(10);
  }, [reduce]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-brand px-6 pb-6 pt-8 text-center text-text">
      <motion.span
        initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.3, duration: 0.45 }}
        className="grid h-[72px] w-[72px] place-items-center rounded-full bg-primary text-on-primary"
      >
        {pending ? (
          <Clock className="h-8 w-8" strokeWidth={2.4} aria-hidden />
        ) : (
          <Check className="h-9 w-9" strokeWidth={3} aria-hidden />
        )}
      </motion.span>
      <p className="num mt-3 text-[3.25rem] font-extrabold leading-none tracking-[-0.05em]">{formatUsd(cents)}</p>
      <div role="status">
        <p className="font-semibold text-on-brand">
          {pending ? `Waiting for @${handle}` : `Sent to @${handle}`}
        </p>
        <p className="mt-1 text-on-brand">
          {pending ? "We'll hold it until they join and link their channel." : "It's already in their balance."}
        </p>
      </div>
      <div className="mt-4 flex w-full flex-col gap-2.5">
        <Button size="lg" fullWidth onClick={onDone}>
          Done
        </Button>
        <Button variant="outline" size="lg" fullWidth onClick={onAgain}>
          Send another
        </Button>
      </div>
    </div>
  );
}
