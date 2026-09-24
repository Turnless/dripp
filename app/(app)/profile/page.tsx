"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowUpRight, ChevronRight, HeartHandshake, LogOut, Radio } from "lucide-react";
import { useAccount } from "@/components/account";
import { ChannelCard } from "@/components/LinkChannel";
import { VerificationCard } from "@/components/VerificationCard";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { Stagger, StaggerItem } from "@/components/motion";
import { WITHDRAWAL_FEE_PERCENT } from "@/lib/fees";
import { VISIBILITY_OPTIONS, type ProfileVisibility } from "@/lib/profile-visibility";

/** Profile + settings. */
export default function ProfilePage() {
  const { user, logout } = usePrivy();
  const { mode, avatarUrl, links, profileVisibility } = useAccount();
  const channel = links.find((l) => l.platform === "youtube");
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const shown = VISIBILITY_OPTIONS.filter((o) => profileVisibility[o.key]).map((o) => o.label);
  const shownSummary = shown.length === 0 ? "Nothing but your handle" : shown.join(", ");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const name = user?.google?.name ?? "Your profile";
  const email = user?.google?.email;
  const creator = mode === "creator";
  const ModeIcon = creator ? Radio : HeartHandshake;

  return (
    <Stagger className="flex flex-col gap-6">
      <StaggerItem>
        <h1 className="text-title-1">Profile</h1>
      </StaggerItem>

      <StaggerItem>
        <GlassCard className="flex items-center gap-4 p-5">
          <Avatar src={avatarUrl} name={name} className="h-16 w-16 text-title-1" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-2 !font-extrabold">{name}</p>
            {email && <p className="truncate text-caption text-muted">{email}</p>}
            {/* Chosen once at sign-up; it can't be changed. */}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-caption font-bold text-on-primary">
              <ModeIcon className="h-3.5 w-3.5" aria-hidden /> {creator ? "Creator" : "Viewer"}
            </span>
          </div>
        </GlassCard>
      </StaggerItem>

      <StaggerItem>
        <VerificationCard />
      </StaggerItem>

      {/* Viewers link their channel here; creators do it on the Creator page. */}
      {!creator && (
        <StaggerItem>
          <ChannelCard
            page="profile"
            blurb="Let people tip you by your YouTube handle, collect any tips sent to it before you joined, and get verified. You need a YouTube channel first; creating one on YouTube is free."
          />
        </StaggerItem>
      )}

      {channel && (
        <StaggerItem>
          <GlassCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 pt-5">
              <div className="min-w-0">
                <p className="font-bold">Public profile</p>
                <p className="truncate text-caption text-muted">dripp · /u/{channel.platform_username}</p>
              </div>
              <Link
                href={`/u/${channel.platform_username}`}
                target="_blank"
                className="pressable inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-text/[0.06] px-3 text-caption font-bold hover:bg-text/[0.1]"
              >
                View <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setVisibilityOpen(true)}
              className="pressable mt-3 flex w-full items-center justify-between gap-4 border-t border-deep/5 px-5 py-4 text-left hover:bg-text/[0.03]"
            >
              <span className="min-w-0">
                <span className="block font-bold">What people see</span>
                <span className="block truncate text-caption text-muted">{shownSummary}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            </button>
          </GlassCard>
        </StaggerItem>
      )}

      <StaggerItem>
        <GlassCard className="overflow-hidden">
          <dl className="divide-y divide-deep/5">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="font-bold">Sending a tip</dt>
              <dd className="text-muted">Free</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="font-bold">Withdrawing</dt>
              <dd className="text-muted">{WITHDRAWAL_FEE_PERCENT} fee</dd>
            </div>
          </dl>
        </GlassCard>
      </StaggerItem>

      <StaggerItem className="flex justify-center">
        <Button variant="ghost" onClick={() => setConfirmSignOut(true)} className="font-extrabold !text-negative">
          <LogOut className="h-5 w-5" aria-hidden /> Sign out
        </Button>
      </StaggerItem>

      <VisibilitySheet open={visibilityOpen} onClose={() => setVisibilityOpen(false)} />

      <Sheet open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out?">
        <div className="flex flex-col gap-6">
          <p className="text-muted">
            Your balance and history stay safe. You&apos;ll need to sign in with Google again to use
            dripp.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" fullWidth onClick={() => setConfirmSignOut(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="lg" fullWidth onClick={logout}>
              <LogOut className="h-5 w-5" aria-hidden /> Sign out
            </Button>
          </div>
        </div>
      </Sheet>
    </Stagger>
  );
}

/** "What people see": one switch per item on the public profile. Each saves on tap. */
function VisibilitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profileVisibility, setProfileVisibility } = useAccount();
  const [saving, setSaving] = useState<keyof ProfileVisibility | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof ProfileVisibility) {
    setSaving(key);
    setError(null);
    try {
      await setProfileVisibility({ [key]: !profileVisibility[key] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="What people see">
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-muted">
          Your public page always shows your handle, picture and verified badge. Choose what else
          appears.
        </p>
        <ul className="divide-y divide-deep/5 overflow-hidden rounded-card bg-text/[0.03]">
          {VISIBILITY_OPTIONS.map((o) => {
            const on = profileVisibility[o.key];
            return (
              <li key={o.key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={saving !== null}
                  onClick={() => toggle(o.key)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left disabled:cursor-wait"
                >
                  <span className="min-w-0">
                    <span className="block font-bold">{o.label}</span>
                    <span className="block text-caption text-muted">{o.detail}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                      on ? "bg-primary" : "bg-text/15"
                    } ${saving === o.key ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${
                        on ? "left-7 bg-brand" : "left-1 bg-white"
                      }`}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="text-caption text-negative" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" fullWidth onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
