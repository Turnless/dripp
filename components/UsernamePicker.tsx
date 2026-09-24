"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AtSign, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/misc";
import { springs } from "@/components/motion";
import { useAuthedFetch } from "@/lib/hooks";
import { checkUsername } from "@/lib/usernames";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; mine: boolean }
  | { state: "unavailable"; reason: string };

/**
 * A username input with a live "available?" check (/api/username/available,
 * debounced). Format problems show straight away, without a request.
 */
export function UsernameField({
  value,
  onChange,
  onAvailability,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onAvailability: (ok: boolean) => void;
  autoFocus?: boolean;
}) {
  const authedFetch = useAuthedFetch();
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const requestId = useRef(0);
  const check = checkUsername(value);

  useEffect(() => {
    onAvailability(false);
    if (!value || !check.ok) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking" });
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      try {
        const res = await authedFetch(`/api/username/available?u=${encodeURIComponent(check.username)}`);
        const json = await res.json();
        if (id !== requestId.current) return;
        if (!res.ok) return setAvailability({ state: "unavailable", reason: json.error ?? "Try again." });
        if (json.available) {
          setAvailability({ state: "available", mine: !!json.mine });
          onAvailability(true);
        } else {
          setAvailability({ state: "unavailable", reason: json.reason ?? "That username isn't available." });
        }
      } catch {
        if (id === requestId.current) setAvailability({ state: "unavailable", reason: "We couldn't check that. Try again." });
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const hint = !value
    ? "3-20 letters, numbers, _ or ."
    : !check.ok
      ? check.error
      : availability.state === "checking"
        ? "Checking..."
        : availability.state === "available"
          ? availability.mine
            ? "That's your username."
            : `@${check.username} is available`
          : availability.state === "unavailable"
            ? availability.reason
            : "";
  const good = check.ok && availability.state === "available";
  const bad = (value && !check.ok) || availability.state === "unavailable";

  return (
    <label className="flex flex-col gap-2">
      <span className="sr-only">Username</span>
      <div className="flex h-14 items-center gap-1 rounded-chip border border-text/15 bg-solid/60 px-4 focus-within:border-text">
        <AtSign className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, "").toLowerCase().slice(0, 20))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="yourname"
          className="h-full w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
        />
        {availability.state === "checking" && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" aria-hidden />}
        {good && <CheckCircle2 className="h-5 w-5 shrink-0 text-positive" aria-hidden />}
        {bad && <XCircle className="h-5 w-5 shrink-0 text-negative" aria-hidden />}
      </div>
      <span
        className={`min-h-5 text-caption ${good ? "text-positive" : bad ? "text-negative" : "text-muted"}`}
        role="status"
      >
        {hint}
      </span>
    </label>
  );
}

/** Sign-up step after viewer/creator: everyone picks a dripp username. */
export function UsernamePicker({
  suggestion,
  onSave,
}: {
  suggestion: string | null;
  onSave: (username: string) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(suggestion ?? "");
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!ok || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="bg-field flex min-h-dvh items-center justify-center px-4 py-12">
      <motion.form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="w-full max-w-md"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={springs.default}
      >
        <Wordmark />
        <h1 className="mt-10 text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          Pick your username
        </h1>
        <p className="mt-3 text-muted">
          People can tip you by it, even without a YouTube channel. You can change it once every 30
          days.
        </p>
        <div className="mt-8">
          <UsernameField value={value} onChange={setValue} onAvailability={setOk} autoFocus />
        </div>
        {error && (
          <p className="mt-2 text-caption text-negative" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={saving} disabled={!ok} className="mt-4">
          Continue
        </Button>
      </motion.form>
    </main>
  );
}
