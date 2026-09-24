"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { monad } from "@/lib/chain";

/**
 * Wraps the app with Privy for login + embedded wallets.
 *
 * loginMethods: ["google"] is the piece that makes "sign up with Google, get
 * an invisible wallet" work in one step -- Privy creates the embedded wallet
 * automatically because of embeddedWallets.createOnLogin below. This is the
 * PRIMARY auth system for the whole app; do not also wrap this in NextAuth
 * (see lib/oauth.ts for why platform linking uses a separate, lighter flow
 * instead of a second full auth system).
 *
 * `appearance` and `embeddedWallets.showWalletUIs` were checked against the
 * installed @privy-io/react-auth@1.99 types. showWalletUIs: false hides
 * Privy's wallet confirmation popups -- required by the invisible-blockchain
 * rule in CLAUDE.md.
 *
 * SmartWalletsProvider (native Privy smart wallets) wraps each user's
 * embedded wallet in a smart account whose gas is paid by the paymaster
 * configured in the Privy dashboard. Import path + API confirmed in the
 * installed @privy-io/react-auth@1.99.1 types (dist/dts/smart-wallets.d.ts)
 * and https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview
 *
 * *** VERIFY BEFORE USE ***
 * The `defaultChain` / `supportedChains` config shape has changed across
 * Privy SDK versions -- confirm against https://docs.privy.io/guide/react/wallets/embedded/setup
 * for the version you actually install. Smart wallets also need the Monad
 * custom chain (143) set up in the Privy dashboard -- not yet run end to end.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        loginMethods: ["google"],
        embeddedWallets: {
          createOnLogin: "all-users",
          showWalletUIs: false,
        },
        defaultChain: monad,
        supportedChains: [monad],
        appearance: {
          // Match the app so the login popup feels native (design.md 10).
          theme: "light",
          accentColor: "#111111",
          landingHeader: "Sign in to dripp",
          showWalletLoginFirst: false,
        },
      }}
    >
      <SmartWalletsProvider>{children}</SmartWalletsProvider>
    </PrivyProvider>
  );
}
