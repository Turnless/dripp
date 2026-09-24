"use client";

import { createContext, useContext } from "react";
import type { ProfileVisibility } from "@/lib/profile-visibility";

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
  setMode: async () => {},
  setProfileVisibility: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
