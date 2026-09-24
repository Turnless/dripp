import { ArrowDownLeft, ArrowDownToLine, ArrowUpRight, Clock, Undo2 } from "lucide-react";
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
  const who = item.counterparty ?? "a dripp user";
  const title =
    item.direction === "withdrawn" ? "Withdrawal" : item.direction === "sent" ? `To ${who}` : `From ${who}`;
  const detail =
    item.status === "waiting"
      ? "Waiting for them to join"
      : item.status === "returned"
        ? "Returned to you · they didn't join in 30 days"
        : item.status === "collected"
        ? item.direction === "sent"
          ? "Collected"
          : "Collected when you joined"
        : item.direction === "withdrawn" && item.feeCents
          ? `Fee ${formatUsd(item.feeCents)}`
          : null;

  const returned = item.status === "returned";
  const Icon =
    item.status === "waiting"
      ? Clock
      : returned
        ? Undo2
        : item.direction === "received"
        ? ArrowDownLeft
        : item.direction === "withdrawn"
          ? ArrowDownToLine
          : ArrowUpRight;
  const incoming = item.direction === "received";

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          incoming ? "bg-positive/10 text-positive" : item.status === "waiting" ? "bg-caution/10 text-caution" : "bg-tint text-emphasis"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-caption text-muted">
          {relativeTime(item.at)}
          {detail ? ` · ${detail}` : ""}
        </p>
      </div>
      <p className={`num shrink-0 font-semibold ${incoming ? "text-positive" : returned ? "text-muted" : ""}`}>
        {/* A returned tip left and came back: no sign, since the balance is unchanged. */}
        {incoming ? "+" : returned ? "" : "−"}
        {formatUsd(item.cents)}
      </p>
    </div>
  );
}
