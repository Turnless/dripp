# Monad live-tipping platform -- code scaffold

This is a starting skeleton, not a finished product. It's organized so the
architecture from `04-architecture.md` maps directly onto folders and files --
see that document for the diagrams this scaffold implements.

## What's confirmed correct vs. what needs a version check

To avoid quietly guessing at anything, this scaffold is explicit about two
different kinds of code:

**Confirmed / stable** -- safe to build on as-is:
- Monad mainnet chain ID (143) and the native USDC contract address
  (`0x754704Bc059F8C67012fEd69BC8A327a5aafb603`) -- both verified against
  Circle's own Monad announcement and Aave's governance asset assessment.
- The YouTube Data API `channels.list?forHandle=` single-lookup pattern in
  `lib/youtube.ts` and the OAuth token/`mine=true` flow in the platform
  callback route -- both are Google's stable, documented endpoints.
- `contracts/src/TipVault.sol` and its test suite -- ordinary, self-contained
  Solidity using standard OpenZeppelin v5 patterns.
- The database schema and the overall request flow.

**Needs verification before you run it** -- flagged in-line with `TODO` or
`*** VERIFY BEFORE USE ***` comments in each file:
- `lib/wallet-server.ts` and `app/providers.tsx` -- the exact Privy /
  ZeroDev / permissionless function signatures for building a sponsored
  smart-account transaction. These SDKs move fast; confirm against
  https://docs.privy.io/recipes/account-abstraction and
  https://docs.monad.xyz/tooling-and-infra/account-abstraction/infra-providers
  before wiring this into the tip endpoint.
- `lib/kick.ts` and the Kick branch of the platform link/callback routes --
  Kick's public API is newer than YouTube's; confirm the exact endpoint
  paths and field names against Kick's current docs.
- `NEXT_PUBLIC_MONAD_RPC_URL` in `.env.example` -- deliberately left blank;
  pull the current production RPC endpoint from https://docs.monad.xyz
  rather than trusting a hardcoded guess.

## Project layout

```
app/                          Next.js App Router
  (app)/                      Signed-in app: Money, Activity, Creator, Profile
  providers.tsx               Privy + SmartWalletsProvider (gas-free sending)
  overlay/[username]/         OBS browser-source page
  api/
    me/                       POST sign-up/sync, PATCH viewer/creator mode
    tip/prepare/              POST -- calls for the user's smart wallet to send
    tip/confirm/              POST -- verify the tx onchain, then record the tip
    withdraw/prepare|confirm/ POST -- payout + 1% fee in one operation (UI waits on Mercuryo)
    balance/                  GET -- balance in cents
    activity/                 GET -- history (tips, escrow, withdrawals)
    username/resolve/         GET -- check if a username exists/is verifiable
    platform/link/[provider]  POST (Privy token) -- returns the OAuth URL to link YouTube/Kick
    platform/callback/[provider]  GET -- finish OAuth, release pending tips
    overlay/events/[username] GET (SSE) -- live tip alerts for the overlay

lib/
  chain.ts                    Monad chain definition + USDC constants
  supabase.ts                 Browser + server Supabase clients
  wallet-server.ts            Server chain helpers: balance, verify transfers, release escrow
  tip-plan.ts                 Where a tip goes + the exact calls (shared by prepare/confirm)
  withdraw-plan.ts            Withdrawal calls: 1% fee to treasury + payout, batched
  tipvault.ts                 TipVault ABI + handle hash
  money-client.ts             Browser: useSendTip, useBalance, useActivity
  youtube.ts / kick.ts        Single-username platform lookups
  username-resolve.ts         DB-first, platform-API-fallback resolution logic
  oauth.ts                    Signed-state helper for platform linking

contracts/
  src/TipVault.sol            Pending-tip escrow contract
  test/TipVault.t.sol         Foundry test suite
  script/Deploy.s.sol         Deployment script

supabase/
  schema.sql                  Full database schema (matches the ER diagram)
```

## Why there's no NextAuth

Privy is the primary auth system (Google login + embedded wallet in one
step). Platform linking (YouTube/Kick, for Creator Mode) uses a small,
custom OAuth flow instead of layering NextAuth on top -- running two
overlapping auth systems for one app is an easy mistake to make here, and
was deliberately avoided (see the comment at the top of `lib/oauth.ts`).

## This scaffold was actually installed and type-checked, not just written

`npm install` and `npx tsc --noEmit` were both run against this exact code
before it was handed to you. That caught two real issues, already fixed here:
- `permissionless@^0.1.29` conflicted with `@privy-io/react-auth`'s peer
  dependency on `permissionless@^0.2.10` -- bumped to match.
- `@privy-io/server-auth` is deprecated in favor of `@privy-io/node` (per
  npm's own registry) -- swapped in `package.json`. If you verify a user's
  Privy access token server-side (e.g. in `/api/tip`), use `@privy-io/node`,
  not the old package name.

`npm install` completes cleanly and `tsc --noEmit` reports zero errors as of
this writing. That does not cover the Solidity contract (no Foundry available
in this environment to run `forge test` against it) -- run `forge test`
yourself after step 4 below before trusting `TipVault.sol` in practice, even
though it was written carefully and reviewed by hand.

## Getting started

1. `cp .env.example .env.local` and fill in every value -- see the
   "needs verification" section above for the ones to double-check first.
2. `npm install`
3. Run `supabase/schema.sql` against your Supabase project.
4. `cd contracts && forge install openzeppelin/openzeppelin-contracts forge-std`
   then `forge test` to confirm `TipVault.sol` passes its test suite.
5. Deploy `TipVault` with `forge script script/Deploy.s.sol` (see the
   comment at the top of that file for the exact command), then paste the
   deployed address into `TIPVAULT_CONTRACT_ADDRESS`.
6. `npm run dev` and open `http://localhost:3000`.

## Gas-free transfers setup

Tips are sent by each user's own smart wallet from the browser, with gas paid
by a paymaster. Nothing moves until these are configured:

1. **ZeroDev** (https://dashboard.zerodev.app): create a project on **Monad
   mainnet**, copy its **bundler URL** and **paymaster URL**, and add a gas
   policy (e.g. sponsor all transactions) plus MON credit for sponsorship.
2. **Privy dashboard** -> your app -> Smart wallets: turn on, choose
   **Kernel (ZeroDev)**, add a **custom chain**: ID `143`, name `Monad`, your
   Monad RPC URL, and the bundler + paymaster URLs from step 1.
3. `.env.local`: `NEXT_PUBLIC_MONAD_RPC_URL` (server verifies transactions
   through it), `TIPVAULT_CONTRACT_ADDRESS` + `TIPVAULT_OWNER_PRIVATE_KEY`
   (the owner address needs a little MON -- it pays gas for escrow claims),
   and `TREASURY_ADDRESS` (receives the 1% withdrawal fee).
4. Existing users: sign out and back in so `/api/me` stores the **smart
   wallet** address (funds live there, not in the embedded signer).

How a tip moves: `/api/tip/prepare` returns the calls -> the smart wallet
sends them as one sponsored operation (no popups: `showWalletUIs: false`) ->
`/api/tip/confirm` checks the transaction's logs onchain before recording
anything. Tips to people who haven't joined are `approve` + `depositPending`
into TipVault in one operation; linking the channel later triggers
`TipVault.claim` from the backend and marks the rows collected.

## Deliberately left as TODOs, not built

- Withdraw UI / Mercuryo offramp integration (the fee-collecting withdraw
  API exists; the sheet stays disabled until Mercuryo supplies a destination)
- "Get it back" button in the app for TipVault refunds (the contract supports
  refunds 30 days after a sender's latest deposit if the creator hasn't
  claimed; the app doesn't call `refund()` yet)
- The bot/real breakdown dashboard (`bot_scores` table exists, nothing
  populates it yet)
- Row Level Security *policies* in Supabase -- RLS itself is enabled on
  every table (deny-all for the public anon key); add narrow policies only if
  the browser ever needs direct table access

These are left as clear gaps rather than filled in with unverified guesses,
in keeping with the instruction not to introduce quiet mistakes -- each one
is a well-scoped next step once the core flow above is running end to end.
