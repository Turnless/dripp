import { Droplet, type LucideIcon } from "lucide-react";
import { formatUsd } from "@/lib/format";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xl font-semibold tracking-[-0.02em] ${className}`}>
      <span className="bg-brand-gradient grid h-8 w-8 place-items-center rounded-full text-white shadow-primary">
        <Droplet className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      dripp
    </span>
  );
}

export function MoneyDisplay({
  cents,
  className = "",
}: {
  cents: number;
  className?: string;
}) {
  return <span className={`num text-money ${className}`}>{formatUsd(cents)}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-text/5 text-muted">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-muted">{title}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-chip bg-text/10 ${className}`} />;
}

/** Full-screen centered message on the background field (splash, setup, errors). */
export function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-field flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      {children}
    </main>
  );
}
