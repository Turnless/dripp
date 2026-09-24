"use client";

import { createContext, useContext } from "react";
import type { ProfileVisibility } from "@/lib/profile-visibility";

/** How the user proved they're a person (lib/bot-check.ts), or null. */
export type Verification = { verified: boolean; via: "youtube" | "phone" | "topup" | "tipped" | null };

export type Mode = "viewer" | "creator";

/** "I use a crypto wallet" (Profile). The deposit address is only sent while it's on. */
export type CryptoOption = { enabled: boolean; depositAddress: string | null };
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
  /** The dripp username (chosen at sign-up), without the @. */
  username: string | null;
  /** When it can next be changed (ISO), or null if it can change now. */
  usernameChangeableAt: string | null;
  /** Saves a new username; throws the server's message if it can't. */
  setUsername: (username: string) => Promise<void>;
  /** What the public profile page (/u/<handle>) shows. */
  profileVisibility: ProfileVisibility;
  /** Viewer verification -- needed to receive group rewards from streamers. */
  verification: Verification;
  /** Whether phone verification (Twilio) is set up on the server yet. */
  phoneVerifyAvailable: boolean;
  /** Updates it after the server confirmed a change (phone verified). */
  setVerification: (v: Verification) => void;
  /** The crypto option: deposit address under Add money, withdraw to an address. */
  crypto: CryptoOption;
  /** Withdrawing to a wallet address: crypto option on AND verified. */
  canWithdrawToAddress: boolean;
  /** Turns the crypto option on or off. */
  setCryptoEnabled: (enabled: boolean) => Promise<void>;
  /** Only used once, at sign-up -- the mode can't change after that. */
  setMode: (mode: Mode) => Promise<void>;
  /** Saves some of the options; resolves with what the server stored. */
  setProfileVisibility: (patch: Partial<ProfileVisibility>) => Promise<void>;
};

export const AccountContext = createContext<Account>({
  mode: null,
  links: [],
  avatarUrl: null,
  username: null,
  usernameChangeableAt: null,
  setUsername: async () => {},
  profileVisibility: { received: true, sent: true, tipCounts: true, subscribers: true },
  crypto: { enabled: false, depositAddress: null },
  canWithdrawToAddress: false,
  setCryptoEnabled: async () => {},
  verification: { verified: false, via: null },
  phoneVerifyAvailable: false,
  setVerification: () => {},
  setMode: async () => {},
  setProfileVisibility: async () => {},
});

/** The signed-in user's account info from /api/me. Available inside AuthGate. */
export const useAccount = () => useContext(AccountContext);
