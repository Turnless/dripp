"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, HeartHandshake, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CenterScreen, Wordmark } from "@/components/ui/misc";
import { Landing } from "@/components/landing/Landing";
import { AccountContext, type Mode, type PlatformLink } from "@/components/account";
import { springs } from "@/components/motion";
import { readError } from "@/lib/hooks";

type Me = { mode: Mode | null; links: PlatformLink[] };
type SetupState = { status: "loading" } | { status: "error" } | { status: "ready"; me: Me };

/**
 * Creates/refreshes the signed-in user's account row via /api/me. The wallet
 * is created client-side just after login, so a 409 means "not yet" -- retry.
 */
function useAccountSetup(enabled: boolean) {
  const { getAccessToken } = usePrivy();
  const [state, setState] = useState<SetupState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          const token = await getAccessToken();
          const res = await fetch("/api/me", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const me = (await res.json()) as Me;
            if (!cancelled) setState({ status: "ready", me });
            return;
          }
          if (res.status !== 409) break;
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setState({ status: "error" });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt, getAccessToken]);

  const setMe = useCallback((me: Me) => setState({ status: "ready", me }), []);
  return { state, setMe, retry: () => setAttempt((a) => a + 1) };
}

/** Signed out -> landing page. Signed in -> setup -> pick viewer/creator once -> the app. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { state, setMe, retry } = useAccountSetup(ready && authenticated);

  const setMode = useCallback(
    async (mode: Mode) => {
      const token = await getAccessToken();
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(await readError(res));
      if (state.status === "ready") setMe({ ...state.me, mode });
    },
    [getAccessToken, state, setMe]
  );

  if (!ready) {
    return (
      <CenterScreen>
        <Wordmark className="animate-pulse" />
      </CenterScreen>
    );
  }

  if (!authenticated) return <Landing />;

  if (state.status === "loading") {
    return (
      <CenterScreen>
        <Wordmark />
        <p className="text-muted" role="status">
          Setting up your account...
        </p>
      </CenterScreen>
    );
  }

  if (state.status === "error") {
    return (
      <CenterScreen>
        <Wordmark />
        <p className="max-w-xs text-muted" role="alert">
          We couldn&apos;t finish setting up your account. Check your connection and try again.
        </p>
        <Button onClick={retry}>Try again</Button>
      </CenterScreen>
    );
  }

  if (state.me.mode === null) return <ModePicker onPick={setMode} />;

  return (
    <AccountContext.Provider value={{ mode: state.me.mode, links: state.me.links, setMode }}>
      {children}
    </AccountContext.Provider>
  );
}

const MODES: { id: Mode; title: string; body: string; icon: typeof Radio }[] = [
  {
    id: "viewer",
    title: "I'm a viewer",
    body: "I want to tip the creators I watch.",
    icon: HeartHandshake,
  },
  {
    id: "creator",
    title: "I'm a creator",
    body: "I stream or make videos and want to receive tips.",
    icon: Radio,
  },
];

export function ModePicker({ onPick }: { onPick: (mode: Mode) => Promise<void> }) {
  const [choice, setChoice] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function save() {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await onPick(choice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="bg-field flex min-h-dvh items-center justify-center px-4 py-12">
      <motion.div
        className="w-full max-w-xl"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={springs.default}
      >
        <Wordmark />
        <h1 className="mt-10 text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          How will you use dripp?
        </h1>
        <p className="mt-3 text-muted">
          This just sets up your home screen. Everyone can send and receive tips, and you can
          change it any time in Profile.
        </p>

        <div role="radiogroup" aria-label="How you'll use dripp" className="mt-8 grid gap-3 sm:grid-cols-2">
          {MODES.map((m, i) => {
            const selected = choice === m.id;
            return (
              <motion.button
                key={m.id}
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(m.id)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.1 + i * 0.07 }}
                whileHover={reduce ? undefined : { y: -3 }}
                whileTap={{ scale: 0.98 }}
                className={`glass relative flex flex-col items-start gap-4 rounded-card p-6 text-left transition-shadow ${
                  selected ? "ring-2 ring-primary" : ""
                }`}
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-2xl transition-colors ${
                    selected ? "bg-primary text-white" : "bg-tint text-emphasis"
                  }`}
                >
                  <m.icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span>
                  <span className="block text-title-2">{m.title}</span>
                  <span className="mt-1 block text-muted">{m.body}</span>
                </span>
                <AnimatePresence>
                  {selected && (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={springs.soft}
                      className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-primary text-white"
                    >
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 text-caption text-negative" role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth className="mt-8" disabled={!choice} loading={saving} onClick={save}>
          Continue
        </Button>
      </motion.div>
    </main>
  );
}
