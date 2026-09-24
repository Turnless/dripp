"use client";

import { createContext, useContext } from "react";
import type { ProfileVisibility } from "@/lib/profile-visibility";

/** How the user proved they're a person (lib/bot-check.ts), or null. */
export type Verification = { verified: boolean; via: "youtube" | "phone" | "topup" | "tipped" | null };

export type Mode = "viewer" | "creator";
export type PlatformLink = {
  platform: "youtube" | "kick";
  platform_username: string;
  avatar_url: string | null;
  needs_relink: boolean;
};

export type Account = {
  mode: Mode | null;
  links: PlatformLink[];
  /** Profile picture from a linked channel, or null (initials are shown). */
  avatarUrl: string | null;
  /** What the public profile page (/u/<handle>) shows. */
  profileVisibility: ProfileVisibility;
  /** Viewer verification -- needed to receive group rewards from streamers. */
  verification: Verification;
  /** Asks the server again (after verifying a phone). */
  refreshVerification: () => Promise<Verification>;
  /** Tester-only stand-in for the offramp: withdraw to a wallet address. */
  canWithdrawToAddress: boolean;
  /** Only used once, at sign-up -- the mode can't change after that. */
  setMode: (mode: Mode) => Promise<void>;
  /** Saves some of the options; resolves with what the server stored. */
  setProfileVisibility: (patch: Partial<ProfileVisibility>) => Promise<void>;
};

export const AccountContext = createContext<Account>({
  mode: null,
  links: [],
  avatarUrl: null,
  profileVisibility: { received: true, sent: true, tipCounts: true, subscribers: true },
  canWithdrawToAddress: false,
  verification: { verified: false, via: null },
  refreshVerification: async () => ({ verified: false, via: null }),
  setMode: async () => {},
  setProfileVisibility: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
