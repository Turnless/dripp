import { ArrowDownToLine, Plus } from "lucide-react";
import { formatUsd } from "@/lib/format";
import type { ActivityItem } from "@/lib/money-client";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

/** One history entry. Shows handles and dollars only -- never addresses or hashes. */
export function ActivityRow({ item }: { item: ActivityItem }) {
  const withdrawal = item.direction === "withdrawn";
  const added = item.direction === "added";
  const incoming = item.direction === "received" || added;
  const waiting = item.status === "waiting";
  const returned = item.status === "returned";
  const title = withdrawal ? "Withdrawal" : added ? "Added money" : (item.counterparty ?? "A dripp user");
  const when = relativeTime(item.at);

  const detail = added
    ? `From your wallet · ${when}`
    : withdrawal
      ? item.feeCents
        ? `Fee ${formatUsd(item.feeCents)} · ${when}`
        : when
      : waiting
        ? `${formatUsd(item.cents)} · Waiting for them to join`
        : returned
          ? `${formatUsd(item.cents)} · Not collected in 30 days`
          : item.status === "collected"
            ? `${incoming ? "Collected when you joined" : "Collected"} · ${when}`
            : `${incoming ? "Tipped you" : "You tipped"} · ${when}`;

  const initial = (title.replace(/^@/, "").charAt(0) || "D").toUpperCase();
  const avatarTone = withdrawal
    ? "bg-primary text-on-primary"
    : added
      ? "bg-brand text-text"
    : incoming
      ? "bg-positive/10 text-positive"
      : waiting
        ? "bg-tint text-on-brand"
        : "bg-text/[0.06] text-text";

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-extrabold ${avatarTone}`}>
        {withdrawal ? (
          <ArrowDownToLine className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        ) : added ? (
          <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{title}</p>
        <p className="truncate text-caption text-muted">{detail}</p>
      </div>
      {waiting ? (
        <span className="shrink-0 rounded-full bg-tint px-2.5 py-1 text-caption font-bold text-on-brand">Waiting</span>
      ) : returned ? (
        // A returned tip left and came back: the balance is unchanged.
        <span className="shrink-0 rounded-full bg-text/[0.07] px-2.5 py-1 text-caption font-bold text-muted">
          Returned
        </span>
      ) : (
        <p className={`num shrink-0 font-extrabold ${incoming ? "text-positive" : ""}`}>
          {incoming ? "+" : "−"}
          {formatUsd(item.cents)}
        </p>
      )}
    </div>
  );
}
