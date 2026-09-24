"use client";

import { createContext, useContext } from "react";

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
  /** Whether the public profile page (/u/<handle>) shows this user's totals. */
  profilePublic: boolean;
  /** Tester-only stand-in for the offramp: withdraw to a wallet address. */
  canWithdrawToAddress: boolean;
  /** Only used once, at sign-up -- the mode can't change after that. */
  setMode: (mode: Mode) => Promise<void>;
  setProfilePublic: (on: boolean) => Promise<void>;
};

export const AccountContext = createContext<Account>({
  mode: null,
  links: [],
  avatarUrl: null,
  profilePublic: true,
  canWithdrawToAddress: false,
  setMode: async () => {},
  setProfilePublic: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
