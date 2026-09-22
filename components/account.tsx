"use client";

import { createContext, useContext } from "react";

export type Mode = "viewer" | "creator";
export type PlatformLink = { platform: "youtube" | "kick"; platform_username: string };

export type Account = {
  mode: Mode | null;
  links: PlatformLink[];
  setMode: (mode: Mode) => Promise<void>;
};

export const AccountContext = createContext<Account>({
  mode: null,
  links: [],
  setMode: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
