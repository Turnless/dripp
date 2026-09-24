"use client";

import { useState } from "react";
import { useLinkAccount } from "@privy-io/react-auth";
import { BadgeCheck, ShieldCheck, Smartphone } from "lucide-react";
import { useAccount, type Verification } from "@/components/account";
import { Button } from "@/components/ui/Button";
import { readError, useAuthedFetch } from "@/lib/hooks";
import { GlassCard } from "@/components/ui/GlassCard";

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

/**
 * Phone verification: asks the server first (each code costs money, so
 * attempts are strictly limited -- /api/me/verify/start), then opens Privy's
 * popup, which sends the code by SMS or WhatsApp, then asks the server to
 * re-check.
 */
export function useVerifyPhone() {
  const { refreshVerification } = useAccount();
  const authedFetch = useAuthedFetch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { linkPhone } = useLinkAccount({
    onSuccess: async (_user, _method, linkedAccount) => {
      // Any verified phone counts, whether the code came by SMS or WhatsApp.
      if (linkedAccount.type !== "phone") return;
      try {
        await refreshVerification();
      } catch (e) {
        setError(e instanceof Error ? e.message : "We couldn't check that right now. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    onError: (code) => {
      setBusy(false);
      // Closing the popup isn't an error worth showing.
      if (code !== "exited_link_flow") setError("We couldn't verify that number. Please try again.");
    },
  });
  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await authedFetch("/api/me/verify/start", { method: "POST" });
      if (res.status === 409) {
        // Already verified (e.g. on another device): just refresh.
        await refreshVerification();
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        setBusy(false);
        return;
      }
    } catch {
      setError("We couldn't reach dripp. Check your connection and try again.");
      setBusy(false);
      return;
    }
    linkPhone();
  };
  return { start, busy, error };
}

export function VerifyPhoneButton({ label = "Verify phone" }: { label?: string }) {
  const { start, busy, error } = useVerifyPhone();
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={start} loading={busy} className="self-start">
        <Smartphone className="h-5 w-5" aria-hidden /> {label}
      </Button>
      {error && (
        <p className="text-caption text-negative" role="alert">
          {error}
        </p>
      )}
    </div>
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
            Verify your phone so streamers can include you when they reward their viewers. Tipping works
            without it.
            {!hasChannel && " Linking your YouTube account can verify you too."}
          </p>
        </div>
      </div>
      <VerifyPhoneButton />
    </GlassCard>
  );
}
