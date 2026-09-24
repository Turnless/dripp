"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { HeartHandshake, LogOut, Radio } from "lucide-react";
import { useAccount } from "@/components/account";
import { ChannelCard } from "@/components/LinkChannel";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { Stagger, StaggerItem } from "@/components/motion";
import { WITHDRAWAL_FEE_PERCENT } from "@/lib/fees";

/** Profile + settings. */
export default function ProfilePage() {
  const { user, logout } = usePrivy();
  const { mode, avatarUrl, links, profilePublic, setProfilePublic } = useAccount();
  const channel = links.find((l) => l.platform === "youtube");
  const [savingPublic, setSavingPublic] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  async function togglePublic() {
    setSavingPublic(true);
    setPublicError(null);
    try {
      await setProfilePublic(!profilePublic);
    } catch (e) {
      setPublicError(e instanceof Error ? e.message : "Could not save that. Please try again.");
    } finally {
      setSavingPublic(false);
    }
  }
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

      {/* Viewers link their channel here; creators do it on the Creator page. */}
      {!creator && (
        <StaggerItem>
          <ChannelCard
            page="profile"
            blurb="Let people tip you by your YouTube handle, and collect any tips sent to it before you joined."
          />
        </StaggerItem>
      )}

      {channel && (
        <StaggerItem>
          <GlassCard className="flex flex-col gap-2 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold">Show my totals publicly</p>
                <p className="text-caption text-muted">
                  What you&apos;ve received and tipped out, on{" "}
                  <Link href={`/u/${channel.platform_username}`} target="_blank" className="underline decoration-brand decoration-2 underline-offset-2">
                    your public page
                  </Link>
                  .
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profilePublic}
                aria-label="Show my totals publicly"
                disabled={savingPublic}
                onClick={togglePublic}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  profilePublic ? "bg-primary" : "bg-text/15"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${
                    profilePublic ? "left-7 bg-brand" : "left-1 bg-white"
                  }`}
                />
              </button>
            </div>
            {publicError && (
              <p className="text-caption text-negative" role="alert">
                {publicError}
              </p>
            )}
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
