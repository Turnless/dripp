"use client";

import { useCallback, useEffect, useState } from "react";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { readError, useAuthedFetch } from "@/lib/hooks";
import type { ActivityItem, WeekSummary } from "@/app/api/activity/route";

export type { ActivityItem };

/** Fired after money moves so balance + activity views refresh themselves. */
const MONEY_CHANGED = "dripp:money-changed";
export const announceMoneyChanged = () => {
  cache.clear();
  window.dispatchEvent(new Event(MONEY_CHANGED));
};

type TipArgs = { platform: "youtube" | "kick"; toUsername: string; amountUsd: number };
type Call = { to: `0x${string}`; data: `0x${string}` };
type AuthedFetch = ReturnType<typeof useAuthedFetch>;

/**
 * Tips whose money has moved but that the server hasn't recorded yet. Kept
 * in localStorage so a closed tab or lost connection doesn't lose them: the
 * app retries them on the next load (useFinishUnconfirmedTips), and the
 * server's reconcile job finds them onchain regardless.
 */
type Unconfirmed = { intentId: string; txHash: `0x${string}`; at: number };
const UNCONFIRMED_KEY = "dripp:unconfirmed-tips";
const UNCONFIRMED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function loadUnconfirmed(): Unconfirmed[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNCONFIRMED_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is Unconfirmed =>
        typeof u?.intentId === "string" &&
        typeof u?.txHash === "string" &&
        typeof u?.at === "number" &&
        Date.now() - u.at < UNCONFIRMED_MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

function saveUnconfirmed(list: Unconfirmed[]) {
  try {
    if (list.length) localStorage.setItem(UNCONFIRMED_KEY, JSON.stringify(list));
    else localStorage.removeItem(UNCONFIRMED_KEY);
  } catch {}
}

const rememberUnconfirmed = (u: Unconfirmed) =>
  saveUnconfirmed([...loadUnconfirmed().filter((x) => x.intentId !== u.intentId), u]);
const forgetUnconfirmed = (intentId: string) =>
  saveUnconfirmed(loadUnconfirmed().filter((x) => x.intentId !== intentId));

/**
 * One call to /api/tip/confirm (see that route for the status codes):
 *   recorded -- saved
 *   not_sent -- the transaction didn't move the money, so it's safe to retry the tip
 *   gone     -- nothing more to do for this one (unknown or already saved)
 *   retry    -- not visible yet, or a temporary problem: ask again later
 */
async function confirmOnce(
  authedFetch: AuthedFetch,
  u: Unconfirmed
): Promise<{ outcome: "recorded" | "not_sent" | "gone" | "retry"; message?: string }> {
  let res: Response;
  try {
    res = await authedFetch("/api/tip/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId: u.intentId, txHash: u.txHash }),
    });
  } catch {
    return { outcome: "retry" };
  }
  if (res.status === 200) return { outcome: "recorded" };
  if (res.status === 422) return { outcome: "not_sent", message: await readError(res) };
  if (res.status === 400 || res.status === 404 || res.status === 409) return { outcome: "gone" };
  return { outcome: "retry" };
}

const CONFIRM_ATTEMPTS = 3;

// The smart wallet sends one operation at a time (a second one sent while
// the first is in flight can collide on the account's nonce), so every send
// in the app -- tips and automatic refunds -- queues here.
let walletQueue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = walletQueue.then(fn, fn);
  walletQueue = run.catch(() => undefined);
  return run;
}

/**
 * Sends a tip gas-free from the user's smart wallet:
 *   1. /api/tip/prepare -> a tip intent + the exact calls (transfer, or
 *      approve + escrow deposit)
 *   2. smart wallet sends them as ONE sponsored operation (no Privy popup --
 *      showWalletUIs is false in app/providers.tsx)
 *   3. /api/tip/confirm -> server verifies the transaction onchain, then records it
 *
 * Once step 2 succeeds the money has moved, so from then on this never
 * throws an error that invites sending again -- except when the server has
 * checked the mined transaction and the payment isn't in it (nothing moved).
 * If confirming keeps failing, the tip is kept for a later retry and still
 * reported as sent.
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
      const { intentId, kind, calls } = (await prep.json()) as {
        intentId: string;
        kind: "direct" | "escrow";
        calls: Call[];
      };

      let txHash: `0x${string}`;
      try {
        txHash = await exclusive(() => client.sendTransaction({ calls }));
      } catch (err) {
        console.error("smart wallet send failed", err);
        throw new Error("We couldn't complete the payment. Check your balance and activity before trying again.");
      }

      const sent: Unconfirmed = { intentId, txHash, at: Date.now() };
      rememberUnconfirmed(sent);
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        const { outcome, message } = await confirmOnce(authedFetch, sent);
        if (outcome === "recorded" || outcome === "gone") {
          forgetUnconfirmed(intentId);
          break;
        }
        if (outcome === "not_sent") {
          forgetUnconfirmed(intentId);
          throw new Error(message ?? "That payment didn't go through, so nothing was sent. Please try again.");
        }
        if (attempt < CONFIRM_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }

      announceMoneyChanged();
      return kind === "direct" ? "settled" : "pending";
    },
    [client, authedFetch]
  );
}

/**
 * Withdrawals sent but not yet recorded, kept like unconfirmed tips. There's
 * no saved intent for a withdrawal, so the confirm call repeats its inputs.
 */
type UnconfirmedWithdrawal = { amountUsd: number; destination: string; txHash: `0x${string}`; at: number };
const UNCONFIRMED_WITHDRAWALS_KEY = "dripp:unconfirmed-withdrawals";

function loadUnconfirmedWithdrawals(): UnconfirmedWithdrawal[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNCONFIRMED_WITHDRAWALS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is UnconfirmedWithdrawal =>
        typeof w?.amountUsd === "number" &&
        typeof w?.destination === "string" &&
        typeof w?.txHash === "string" &&
        typeof w?.at === "number" &&
        Date.now() - w.at < UNCONFIRMED_MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

function saveUnconfirmedWithdrawals(list: UnconfirmedWithdrawal[]) {
  try {
    if (list.length) localStorage.setItem(UNCONFIRMED_WITHDRAWALS_KEY, JSON.stringify(list));
    else localStorage.removeItem(UNCONFIRMED_WITHDRAWALS_KEY);
  } catch {}
}

const forgetUnconfirmedWithdrawal = (txHash: string) =>
  saveUnconfirmedWithdrawals(loadUnconfirmedWithdrawals().filter((w) => w.txHash !== txHash));

/** One call to /api/withdraw/confirm; same outcomes as confirmOnce. */
async function confirmWithdrawalOnce(
  authedFetch: AuthedFetch,
  w: UnconfirmedWithdrawal
): Promise<"recorded" | "not_sent" | "gone" | "retry"> {
  let res: Response;
  try {
    res = await authedFetch("/api/withdraw/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsd: w.amountUsd, destination: w.destination, txHash: w.txHash }),
    });
  } catch {
    return "retry";
  }
  if (res.status === 200) return "recorded";
  if (res.status === 422) return "not_sent";
  if (res.status === 400 || res.status === 409) return "gone";
  return "retry";
}

/**
 * Withdraws from the user's smart wallet: /api/withdraw/prepare returns the
 * payout + the 1% fee as one batched, gas-free operation; then confirm
 * records it. Like tips, once the wallet has sent this never invites sending
 * again, except when the mined transaction didn't move the money.
 */
export function useWithdraw() {
  const { client } = useSmartWallets();
  const authedFetch = useAuthedFetch();

  return useCallback(
    async (amountUsd: number, destination: string): Promise<void> => {
      if (!client) throw new Error("Your account is still getting ready. Try again in a few seconds.");

      const prep = await authedFetch("/api/withdraw/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, destination }),
      });
      if (!prep.ok) throw new Error(await readError(prep));
      const { calls } = (await prep.json()) as { calls: Call[] };

      let txHash: `0x${string}`;
      try {
        txHash = await exclusive(() => client.sendTransaction({ calls }));
      } catch (err) {
        console.error("smart wallet send failed", err);
        throw new Error("We couldn't complete the withdrawal. Check your balance and activity before trying again.");
      }

      const sent: UnconfirmedWithdrawal = { amountUsd, destination, txHash, at: Date.now() };
      saveUnconfirmedWithdrawals([...loadUnconfirmedWithdrawals(), sent]);
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        const outcome = await confirmWithdrawalOnce(authedFetch, sent);
        if (outcome === "recorded" || outcome === "gone") {
          forgetUnconfirmedWithdrawal(txHash);
          break;
        }
        if (outcome === "not_sent") {
          forgetUnconfirmedWithdrawal(txHash);
          throw new Error("That withdrawal didn't go through, so nothing was sent. Please try again.");
        }
        if (attempt < CONFIRM_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
      announceMoneyChanged();
    },
    [client, authedFetch]
  );
}

let finishStarted = false;

/**
 * Once per page load, retries saving tips that were sent but not yet
 * recorded (see Unconfirmed above). Mounted by the signed-in app shell.
 */
export function useFinishUnconfirmedTips() {
  const authedFetch = useAuthedFetch();
  useEffect(() => {
    if (finishStarted) return;
    const list = loadUnconfirmed();
    saveUnconfirmed(list); // drops expired entries
    const withdrawals = loadUnconfirmedWithdrawals();
    saveUnconfirmedWithdrawals(withdrawals);
    if (!list.length && !withdrawals.length) return;
    finishStarted = true;
    (async () => {
      let changed = false;
      for (const u of list) {
        const { outcome } = await confirmOnce(authedFetch, u);
        if (outcome === "retry") continue;
        forgetUnconfirmed(u.intentId);
        if (outcome === "recorded") changed = true;
      }
      for (const w of withdrawals) {
        const outcome = await confirmWithdrawalOnce(authedFetch, w);
        if (outcome === "retry") continue;
        forgetUnconfirmedWithdrawal(w.txHash);
        if (outcome === "recorded") changed = true;
      }
      if (changed) announceMoneyChanged();
    })();
  }, [authedFetch]);
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

/** Recent activity plus what came in over the last 7 days, for the Money screen. */
export function useRecentWithWeek(limit = 5) {
  return useMoneyQuery(`/api/activity?limit=${limit}&week=1`, (j) => ({
    items: j.items as ActivityItem[],
    week: j.week as WeekSummary,
  }));
}

export type ReturnedTips = { cents: number; handles: string[] };

let refundsStarted = false;

/**
 * Once per page load: if tips this user escrowed for someone who didn't join
 * within 30 days can be returned, returns them -- the smart wallet sends
 * TipVault.refund (gas-free, no prompt; only the sender's own wallet can)
 * and the server records it. Calls `onReturned` so the app can say so.
 * Mounted by the signed-in app shell. If anything fails it simply tries
 * again on the next load, and the reconcile job records refunds whose
 * confirmation was missed.
 */
export function useAutoRefunds(onReturned: (returned: ReturnedTips) => void) {
  const { client } = useSmartWallets();
  const authedFetch = useAuthedFetch();

  useEffect(() => {
    if (!client || refundsStarted) return;
    refundsStarted = true;
    (async () => {
      try {
        const res = await authedFetch("/api/escrow/refunds");
        if (!res.ok) return;
        const due = (await res.json()) as ReturnedTips & { calls: Call[] };
        if (!due.calls.length) return;

        const txHash = await exclusive(() => client.sendTransaction({ calls: due.calls }));
        // 422 = the transaction was mined without any refund in it (e.g. the
        // creator claimed first), so nothing came back. Anything else means
        // it went through, or is still confirming.
        let returned = true;
        for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
          const conf = await authedFetch("/api/escrow/refunds/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash }),
          }).catch(() => null);
          if (conf?.status === 200) break;
          if (conf?.status === 422) {
            returned = false;
            break;
          }
          if (conf && conf.status >= 400 && conf.status < 500 && conf.status !== 429) break;
          if (attempt < CONFIRM_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
        announceMoneyChanged();
        if (returned) onReturned({ cents: due.cents, handles: due.handles });
      } catch (err) {
        console.error("automatic refund failed -- will retry on next load", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, authedFetch]);
}
