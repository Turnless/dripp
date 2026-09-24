"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { AlertTriangle, Check, ChevronRight, Copy, CreditCard, Wallet } from "lucide-react";
import { useAccount } from "@/components/account";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/**
 * Card or bank through Mercuryo (onramp/offramp): not live yet, so it shows
 * as "coming soon" for everyone, in Add money and Withdraw alike.
 */
export function MercuryoSoonRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-text/[0.04] p-4" aria-disabled>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-text/[0.07] text-muted">
        <CreditCard className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-caption text-muted">{body}</span>
      </span>
      <span className="shrink-0 rounded-full bg-tint px-2.5 py-1 text-caption font-bold text-on-brand">Soon</span>
    </div>
  );
}

/** Where the crypto option lives, for people who haven't turned it on. */
export function CryptoOptionHint({ onNavigate, text }: { onNavigate: () => void; text: string }) {
  return (
    <Link
      href="/profile"
      onClick={onNavigate}
      className="pressable flex items-center gap-4 rounded-card p-4 ring-1 ring-inset ring-text/10 hover:bg-text/[0.03]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-text/[0.06] text-text">
        <Wallet className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Use a crypto wallet?</span>
        <span className="block text-caption text-muted">{text}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

/**
 * Add money. Card or bank (Mercuryo) is "coming soon". With the crypto option
 * on (Profile), it also shows the account's deposit address as text and a
 * QR code, with a clear "USDC on Monad only" warning -- the one place the app
 * names the network, because sending anything else loses it.
 */
export function AddMoneySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { crypto } = useAccount();
  const address = crypto.enabled ? crypto.depositAddress : null;

  return (
    <Sheet open={open} onClose={onClose} title="Add money">
      <div className="flex flex-col gap-4 pt-1">
        <MercuryoSoonRow title="Card or bank" body="Add money with your card or a bank transfer." />
        {address ? (
          <CryptoDeposit address={address} />
        ) : (
          <CryptoOptionHint onNavigate={onClose} text="Turn it on in Profile to add money from your wallet." />
        )}
        <Button size="lg" fullWidth variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

function CryptoDeposit({ address }: { address: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(address, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } })
      .then((svg) => !cancelled && setQr(svg))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is still selectable.
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card bg-text/[0.04] p-4">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-text">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-bold">From a crypto wallet</span>
          <span className="block text-caption text-muted">Send to your dripp address below.</span>
        </span>
      </div>

      <div className="mx-auto w-44 rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(15,14,26,0.1)]">
        {qr ? (
          // Generated locally from the address; no user-supplied markup.
          <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-lg bg-text/[0.06]" />
        )}
      </div>

      <button
        type="button"
        onClick={copy}
        className="pressable flex items-center gap-3 rounded-chip bg-solid/70 px-4 py-3 text-left ring-1 ring-inset ring-text/10 hover:bg-solid"
      >
        <span className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] leading-snug">{address}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-caption font-bold">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </span>
      </button>

      <p className="flex items-start gap-2 rounded-chip bg-negative/10 px-3 py-2.5 text-caption font-semibold text-negative" role="note">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Send only USDC on the Monad network. Other coins, or USDC on another network, will be lost.
      </p>
      <p className="text-caption text-muted">
        It shows in your balance as soon as it arrives, and in Activity as &ldquo;Added money&rdquo; a minute or so later.
      </p>
    </div>
  );
}
