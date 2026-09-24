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
  /** Only used once, at sign-up -- the mode can't change after that. */
  setMode: (mode: Mode) => Promise<void>;
};

export const AccountContext = createContext<Account>({
  mode: null,
  links: [],
  avatarUrl: null,
  setMode: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
