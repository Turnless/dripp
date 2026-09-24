"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { HeartHandshake, LogOut, Radio } from "lucide-react";
import { useAccount } from "@/components/account";
import { ChannelCard } from "@/components/LinkChannel";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { Stagger, StaggerItem } from "@/components/motion";

/** Profile + settings. */
export default function ProfilePage() {
  const { user, logout } = usePrivy();
  const { mode, avatarUrl } = useAccount();
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
          <Avatar src={avatarUrl} name={name} className="h-14 w-14 text-title-2 shadow-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-2">{name}</p>
            {email && <p className="truncate text-caption text-muted">{email}</p>}
          </div>
          {/* Chosen once at sign-up; it can't be changed. */}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-caption font-semibold text-emphasis">
            <ModeIcon className="h-4 w-4" aria-hidden /> {creator ? "Creator" : "Viewer"}
          </span>
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

      <StaggerItem>
        <Button variant="ghost" onClick={() => setConfirmSignOut(true)}>
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
