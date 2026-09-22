# CLAUDE.md

Instructions for Claude Code working in this repository. Read this before
making changes -- it exists specifically to prevent this project from
re-introducing mistakes that were already found and fixed once.

## What this project is

A cross-platform live-tipping product on Monad (mainnet, chain ID 143),
settling in native USDC (`0x754704Bc059F8C67012fEd69BC8A327a5aafb603`), built
for a hackathon in the Consumer Products & Payments track. Full context lives
in these docs -- read the relevant one before touching that part of the
project, don't guess from the code alone:

- `01-problem-and-failures.md` -- why every prior crypto-tipping attempt died
- `02-differentiation.md` -- what this project does differently, and why
- `03-product-requirements-document.md` -- full feature scope, non-goals, judging-criteria mapping
- `04-architecture.md` -- system diagrams, data flows, schema, contract design
- `design.md` -- frontend design system (colors, glass, type, motion, screens); read before any UI work in `app/`
- `README.md` -- setup steps and the confirmed-vs-needs-verification split for this codebase

## Non-negotiable design principle

**The blockchain must be invisible in every user-facing flow.** No wallet
addresses, no token tickers, no gas prompts, no seed phrases, no wallet-connect
UI, anywhere in sign-up, tipping, or withdrawal. Balances are always shown in
dollars. The one disclosed exception is the platform's own fee, charged only
on withdrawals (tips are free) and shown plainly before a withdrawal is
confirmed -- that's pricing transparency, not a crypto-jargon leak.

Before adding or changing any UI in `app/`, check: does this still pass that
bar? If a change would surface a wallet address or a gas concept to the end
user, stop and flag it rather than shipping it.

## Do not reintroduce these specific mistakes

- **Do not add NextAuth (or any second full auth system).** Privy is the
  sole primary auth + wallet provider (`app/providers.tsx`). Platform linking
  (YouTube/Kick) uses the hand-rolled OAuth flow in `lib/oauth.ts` and
  `app/api/platform/*` on purpose -- see the comment at the top of
  `lib/oauth.ts` for why. If a task seems to call for NextAuth, it almost
  certainly means "extend the existing platform-link flow" instead.
- **Do not swap native USDC for USDT/USDT0 as the default asset.** USDT on
  Monad is a bridged token (USDT0) with materially less liquidity -- confirmed
  in `02-differentiation.md`. USDC stays the only supported asset unless the
  human explicitly asks to add USDT0 as a secondary option.
- **Do not reintroduce quadratic funding / matching pools.** Explicitly
  dropped, see the Non-Goals section of `03-product-requirements-document.md`.
- **Do not build a "pull all usernames" integration against YouTube or Kick.**
  No platform exposes that, and it isn't needed -- see the username resolution
  logic in `lib/username-resolve.ts` (own database first, one live single-handle
  lookup only when needed) and follow that exact pattern for any new platform.

## Before touching the account-abstraction layer

`lib/wallet-server.ts` and the smart-account parts of `app/providers.tsx` are
flagged `*** VERIFY BEFORE USE ***` in the code for a reason: the Privy /
ZeroDev / permissionless SDKs change their APIs frequently. Before editing
either file:
1. Check the current docs at https://docs.privy.io/recipes/account-abstraction
   and https://docs.monad.xyz/tooling-and-infra/account-abstraction/infra-providers
2. Confirm the installed package versions in `package.json` match what those
   docs assume -- do not assume training data is current for these two SDKs
   specifically.
3. Do not silently replace the `*** VERIFY BEFORE USE ***` comment with
   confident-looking code unless the above was actually checked. If unsure,
   leave the comment in place and flag the uncertainty to the human instead
   of guessing.

Same rule applies to `lib/kick.ts` and the Kick branches of
`app/api/platform/link/[provider]/route.ts` and
`app/api/platform/callback/[provider]/route.ts` -- Kick's public API is newer
and less stable than YouTube's Data API.

## Required checks after changes

- Any change under `contracts/` → run `forge test` before considering the
  change done. Never edit `TipVault.sol` without updating `TipVault.t.sol` to
  match.
- Any change to `.ts` / `.tsx` files → run `npx tsc --noEmit` before
  considering the change done. This caught two real dependency/config bugs
  during the initial scaffold build; keep using it.
- Any change to `supabase/schema.sql` → update the ER diagram in
  `04-architecture.md` to match, and vice versa.

## Known gaps (intentionally incomplete, not overlooked)

Listed in full in `README.md` under "Deliberately left as TODOs" --
Mercuryo offramp (withdraw UI), the in-app refund button, the bot/real
breakdown dashboard, and Supabase Row Level Security policies. Pick these up
as explicit, separate tasks rather than assuming they're implicitly in scope
for an unrelated change.

## Tech stack quick reference

| Layer | Tool |
|---|---|
| Login + wallet | Privy |
| Gas sponsorship / smart account | ZeroDev |
| Chain library | viem (+ wagmi in React) |
| Contracts | Solidity + Foundry |
| Payment rail | Monad MPP SDK / x402 facilitator |
| Onramp/offramp | Mercuryo |
| Frontend | Next.js (App Router) + Tailwind |
| Overlay real-time | Server-Sent Events |
| Database | Supabase (Postgres) |
| Platform data | YouTube Data API (`forHandle`), Kick public API |
