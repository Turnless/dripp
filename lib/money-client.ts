"use client";

import { useCallback, useEffect, useState } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { readError, useAuthedFetch } from "@/lib/hooks";
import type { ActivityItem } from "@/app/api/activity/route";

export type { ActivityItem };

/** Fired after money moves so balance + activity views refresh themselves. */
const MONEY_CHANGED = "dripp:money-changed";
export const announceMoneyChanged = () => {
  cache.clear();
  window.dispatchEvent(new Event(MONEY_CHANGED));
};

type TipArgs = { platform: "youtube" | "kick"; toUsername: string; amountUsd: number };
type Call = { to: `0x${string}`; data: `0x${string}` };

/**
 * Sends a tip gas-free from the user's smart wallet:
 *   1. /api/tip/prepare -> the exact calls (transfer, or approve + escrow deposit)
 *   2. smart wallet sends them as ONE sponsored operation (no Privy popup --
 *      showWalletUIs is false in app/providers.tsx)
 *   3. /api/tip/confirm -> server verifies the transaction onchain, then records it
 */
export function useSendTip() {
  const { client } = useSmartWallets();
  const authedFetch = useAuthedFetch();

  return useCallback(
    async (tip: TipArgs): Promise<"settled" | "pending"> => {
      if (!client) throw new Error("Your account is still getting ready. Try again in a few seconds.");

      const prep = await authedFetch("/api/tip/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tip),
      });
      if (!prep.ok) throw new Error(await readError(prep));
      const { calls } = (await prep.json()) as { calls: Call[] };

      let txHash: `0x${string}`;
      try {
        txHash = await client.sendTransaction({ calls });
      } catch (err) {
        console.error("smart wallet send failed", err);
        throw new Error("The payment didn't go through. Check your balance and try again.");
      }

      const conf = await authedFetch("/api/tip/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tip, txHash }),
      });
      if (!conf.ok) throw new Error(await readError(conf));
      const { status } = (await conf.json()) as { status: "settled" | "pending" };
      announceMoneyChanged();
      return status;
    },
    [client, authedFetch]
  );
}

// Shares one request per URL between components and across React's
// development double-render, and serves a very recent result instead of
// re-fetching. announceMoneyChanged() clears it so refreshes are immediate.
const cache = new Map<string, { at: number; json: any }>();
const inFlight = new Map<string, Promise<any>>();
const FRESH_MS = 4000;

function useMoneyQuery<T>(url: string, pick: (json: any) => T) {
  const authedFetch = useAuthedFetch();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      const cached = cache.get(url);
      if (!force && cached && Date.now() - cached.at < FRESH_MS) {
        setData(pick(cached.json));
        return;
      }
      try {
        let pending = inFlight.get(url);
        if (!pending) {
          pending = (async () => {
            const res = await authedFetch(url);
            if (!res.ok) throw new Error(await readError(res));
            const json = await res.json();
            cache.set(url, { at: Date.now(), json });
            return json;
          })().finally(() => inFlight.delete(url));
          inFlight.set(url, pending);
        }
        setData(pick(await pending));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "We couldn't reach dripp. Check your connection.");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [authedFetch, url]
  );

  useEffect(() => {
    load();
    const refresh = () => load(true);
    const onFocus = () => load();
    window.addEventListener(MONEY_CHANGED, refresh);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(MONEY_CHANGED, refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  return { data, error, reload: () => load(true) };
}

/** Balance in cents (null while loading). */
export function useBalance() {
  return useMoneyQuery("/api/balance", (j) => j.cents as number);
}

export function useActivity(limit = 50) {
  return useMoneyQuery(`/api/activity?limit=${limit}`, (j) => j.items as ActivityItem[]);
}
