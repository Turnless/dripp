"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { useAccount, type Verification } from "@/components/account";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { readError, useAuthedFetch } from "@/lib/hooks";

/**
 * Viewer verification, as the viewer sees it: only the outcome, never the
 * rules (lib/bot-check.ts). Verified people can be included when streamers
 * reward their viewers; tipping works either way.
 */

const VIA_TEXT: Record<NonNullable<Verification["via"]>, string> = {
  youtube: "Your YouTube account verified you.",
  phone: "You verified your phone number.",
  topup: "You added money with a card.",
  tipped: "You've tipped with your own money.",
};

type Channel = "whatsapp" | "sms";

/**
 * "Verify your phone": number -> code sent by WhatsApp or SMS (Twilio, via
 * /api/me/verify/start) -> enter the code (/api/me/verify/check). The server
 * limits attempts strictly; its messages are shown as they are.
 */
export function VerifyPhoneSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setVerification } = useAccount();
  const authedFetch = useAuthedFetch();
  const [step, setStep] = useState<"number" | "code" | "done">("number");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [phoneText, setPhoneText] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("number");
    setCode("");
    setError(null);
  }, [open]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = res.ok || res.status === 409 ? await res.clone().json().catch(() => ({})) : {};
      if (!res.ok) {
        // Already verified (e.g. on another device): take the new state.
        if (res.status === 409 && json.verification) {
          setVerification(json.verification as Verification);
          setStep("done");
          return null;
        }
        setError(await readError(res));
        return null;
      }
      return json as Record<string, unknown>;
    } catch {
      setError("We couldn't reach dripp. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    const json = await post("/api/me/verify/start", { phone: phoneText, channel });
    if (json?.sent) {
      setSentTo(String(json.phone ?? phoneText));
      setCode("");
      setStep("code");
    }
  }

  async function checkCode() {
    const json = await post("/api/me/verify/check", { phone: sentTo, code });
    if (json?.verification) {
      setVerification(json.verification as Verification);
      setStep("done");
    }
  }

  const title = step === "done" ? "You're verified" : "Verify your phone";

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {step === "number" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) sendCode();
          }}
          className="flex flex-col gap-5 pt-1"
        >
          <p className="text-muted">
            We&apos;ll send you a 6-digit code. Your number is only used to check you&apos;re a real person;
            it&apos;s never shown to anyone.
          </p>

          <div role="radiogroup" aria-label="Send the code by" className="grid grid-cols-2 gap-1 rounded-full bg-text/[0.05] p-1">
            {(
              [
                ["whatsapp", "WhatsApp", MessageCircle],
                ["sms", "Text message", Smartphone],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={channel === id}
                onClick={() => setChannel(id)}
                className={`pressable inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-[0.9375rem] font-semibold ${
                  channel === id ? "bg-primary text-on-primary" : "text-muted hover:text-text"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-caption text-muted">Phone number, with country code</span>
            <input
              value={phoneText}
              onChange={(e) => setPhoneText(e.target.value.replace(/[^\d+\s().-]/g, ""))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+44 7700 900123"
              className="h-14 rounded-chip border border-text/15 bg-solid/40 px-4 text-lg outline-none placeholder:text-muted/60 focus:border-text"
            />
          </label>

          {error && (
            <p className="text-caption text-negative" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy} disabled={phoneText.replace(/\D/g, "").length < 7}>
            Send code
          </Button>
        </form>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) checkCode();
          }}
          className="flex flex-col gap-5 pt-1"
        >
          <p className="text-muted">
            Enter the code we sent by {channel === "whatsapp" ? "WhatsApp" : "text message"} to{" "}
            <span className="font-semibold text-text">{sentTo}</span>.
          </p>
          <label className="flex flex-col gap-2">
            <span className="sr-only">Verification code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="num h-16 rounded-chip border border-text/15 bg-solid/40 px-4 text-center text-[1.75rem] font-extrabold tracking-[0.3em] outline-none placeholder:text-muted/40 focus:border-text"
            />
          </label>

          {error && (
            <p className="text-caption text-negative" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy} disabled={code.length < 4}>
            Verify
          </Button>
          <div className="flex justify-between text-caption">
            <button type="button" onClick={() => setStep("number")} className="font-semibold text-muted hover:text-text">
              Change number
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="font-semibold text-muted hover:text-text disabled:opacity-50"
            >
              Send a new code
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 rounded-card bg-brand px-6 pb-6 pt-8 text-center text-text">
          <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-primary text-on-primary">
            <BadgeCheck className="h-9 w-9" strokeWidth={2.4} aria-hidden />
          </span>
          <p className="mt-2 font-semibold text-on-brand" role="status">
            Streamers can now include you when they reward their viewers.
          </p>
          <Button size="lg" fullWidth onClick={onClose} className="mt-3">
            Done
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** The sheet's open state, for places that open it from their own button or card. */
export function useVerifyPhone() {
  const [open, setOpen] = useState(false);
  return {
    start: () => setOpen(true),
    sheet: <VerifyPhoneSheet open={open} onClose={() => setOpen(false)} />,
  };
}

export function VerifyPhoneButton({ label = "Verify phone" }: { label?: string }) {
  const { start, sheet } = useVerifyPhone();
  return (
    <>
      <Button onClick={start} className="self-start">
        <Smartphone className="h-5 w-5" aria-hidden /> {label}
      </Button>
      {sheet}
    </>
  );
}

/** Profile card: verified state, or the one step left. */
export function VerificationCard() {
  const { verification, links } = useAccount();

  if (verification.verified) {
    return (
      <GlassCard className="flex items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-text">
          <BadgeCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-bold">Verified</p>
          <p className="text-caption text-muted">
            {verification.via ? VIA_TEXT[verification.via] : ""} Streamers can include you when they reward
            their viewers.
          </p>
        </div>
      </GlassCard>
    );
  }

  const hasChannel = links.some((l) => l.platform === "youtube");
  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-text">
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-bold">One more step</p>
          <p className="text-caption text-muted">
            Verify your phone by WhatsApp or text so streamers can include you when they reward their
            viewers. Tipping works without it.
            {!hasChannel && " Linking your YouTube account can verify you too."}
          </p>
        </div>
      </div>
      <VerifyPhoneButton />
    </GlassCard>
  );
}
