# dripp -- cross-platform live tipping on Monad

Viewers tip streamers (and streamers reward viewers) with real dollars that
settle in native USDC on Monad mainnet, without ever seeing a wallet, a gas
prompt or a token ticker. Sign-in is Google via Privy; each user gets a
gas-sponsored smart wallet; tips to creators who haven't joined yet are held
in the `TipVault` escrow contract until they link their channel.

The product and design docs (`03-product-requirements-document.md`,
`04-architecture.md`) live in `docs/` locally and are not published; this
README covers the code. The design tokens (the "Coin" palette -- yellow
`#FFD23F` and ink `#111111` -- and Schibsted Grotesk) are in
`app/globals.css` and `tailwind.config.ts`.

## Status

**Verified on Monad mainnet**
- Google sign-in with an invisible, gas-sponsored smart wallet (Privy smart
  wallets, Kernel account; bundler + paymaster from Pimlico).
- Sending tips between two users, gas paid by the paymaster.
- Releasing escrowed tips when someone links their YouTube channel (anyone
  can link: creators on the Creator page, viewers on Profile), signed by the
  Privy server wallet that owns TipVault.

**Built, confirm on mainnet before relying on it**
- Returning escrowed tips to the sender after 30 days unclaimed.
- Withdrawing to a wallet address (the offramp stand-in, only for the
  accounts in `WITHDRAW_TO_ADDRESS_EMAILS`).
- The live subscriber count on the Creator page and the public profile page
  (`/u/<handle>`; the user picks what it shows under Profile → "What people
  see": total received, total tipped out, tip counts, subscriber count).
- Bulk sends (the same path as a single tip, once per recipient).
- The background recovery job (records tips and refunds whose confirmation
  was missed, finishes escrow claims).
- The OBS overlay.

Automated tests: `npm test` (money math, the onchain log checks, the confirm
route, OAuth state, channel-ID resolution, the lookup cache, rate limiting,
refunds, the one-time mode choice, the public-profile options, who may
withdraw to an address, and the bot/real rules) and `forge test` in
`contracts/` (unit tests plus invariant tests: every handle's escrow equals
its senders' contributions and the vault's balance, and a claimed tip can
never also be refunded).

**Not built yet** -- see "Deliberately left as TODOs" below.

**Still to verify before depending on it**
- `lib/kick.ts` and the Kick branch of the platform link/callback routes --
  Kick's public API is newer than YouTube's; confirm endpoint paths and field
  names against Kick's current docs (marked `*** VERIFY BEFORE USE ***`).
- After upgrading `@privy-io/react-auth` or changing the bundler/paymaster
  provider, re-check the smart-wallet code in `app/providers.tsx`,
  `lib/money-client.ts` and `lib/wallet-server.ts` against
  https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview.

## How money moves

1. **Prepare** -- `/api/tip/prepare` resolves the recipient and saves a
   **tip intent** (who, what, how much), then returns the calls for the
   smart wallet. Identity is the platform's **channel ID**, not the handle:
   the handle is looked up (cached) to find its channel right now, so a
   renamed or reassigned handle can't send money to the wrong person.
2. **Send** -- the browser's smart wallet sends the calls as one
   gas-sponsored operation (no popups: `showWalletUIs: false`). A direct tip
   is a USDC `transfer`; a tip to someone who hasn't joined is `approve` +
   `TipVault.depositPending`, escrowed under the channel's key.
3. **Confirm** -- `/api/tip/confirm` checks the transaction's logs onchain
   against the saved intent (never re-resolving the recipient) and records
   it through `record_tip` in `supabase/functions.sql`. Each onchain log can
   back only one record in any table (`chain_logs`).
4. **Never pay twice** -- once the money has moved, the app never offers to
   send again. If confirming fails it retries, keeps the tip in the
   browser's storage and retries on the next load, and the reconcile job
   records anything still missing from the chain.
5. **Claim** -- when someone links their channel, the backend sends
   `TipVault.claim` for the channel's key (and for the older handle key, for
   deposits made before channel IDs), writes each claim to `escrow_claims`
   straight away, and marks as collected exactly the deposits it released,
   from its receipt.
6. **Refund** -- if nobody claims within 30 days of the sender's latest
   deposit, the sender's app returns the money the next time they open it:
   their smart wallet calls `TipVault.refund` (gas-free, no prompt -- only
   the sender's own wallet can), and they see a short note. Refunds whose
   confirmation was missed are recorded by the reconcile job.

Tips are free; the only fee is 1% on withdrawals (`lib/fees.ts`).

## Project layout

```
app/                          Next.js App Router
  (app)/                      Signed-in app: Money, Activity, Creator, Profile
  providers.tsx               Privy + SmartWalletsProvider (gas-free sending)
  overlay/[username]/         OBS browser-source page (?platform=youtube|kick)
  u/[handle]/                 Public profile: whichever totals / subscriber count the user chose to show
  api/
    me/                       POST sign-up/sync, PATCH viewer/creator mode or what the public profile shows
    tip/prepare/              POST -- save a tip intent, return the calls for the smart wallet to send
    tip/confirm/              POST -- verify the tx onchain against the intent, then record the tip
    withdraw/prepare|confirm/ POST -- payout + 1% fee in one operation (to a wallet address, testers only, until Mercuryo)
    creator/stats/            GET -- live subscriber count of the caller's linked channel
    creator/tippers/          GET -- 30-day bot/real breakdown of the caller's tippers (counts only)
    bot-check/                POST -- flag likely bots in a reward drop's recipient list
    balance/                  GET -- balance in cents
    activity/                 GET -- history (tips, escrow, withdrawals); ?week=1 adds the last 7 days received
    username/resolve/         GET -- check if a username exists/is verifiable
    platform/link/[provider]  POST (Privy token) -- returns the OAuth URL to link YouTube/Kick
    platform/callback/[provider]  GET -- finish OAuth, link the channel, release escrowed tips
    escrow/refunds/           GET -- refundable escrow + the calls; confirm/ POST -- record a refund
    overlay/events/[username] GET (SSE) -- live tip alerts for the overlay
    cron/reconcile/           GET (CRON_SECRET) -- record tips confirm missed, finish escrow claims

lib/
  chain.ts                    Monad chain definition + USDC constants (from env)
  supabase.ts                 Browser + server Supabase clients
  wallet-server.ts            Server chain helpers: balance, verify transfers, escrow claims, log scans
  escrow-claims.ts            Send TipVault.claim and mark exactly the tips it released
  escrow-refunds.ts           What a sender can take back after 30 days; record refunds
  tip-plan.ts                 Where a tip goes + the exact calls (saved as a tip intent by prepare)
  withdraw-plan.ts            Withdrawal calls: 1% fee to treasury + payout, batched
  withdraw-access.ts          Who may withdraw to a wallet address (WITHDRAW_TO_ADDRESS_EMAILS)
  bot-check.ts                Bot/real rules for tippers and reward-drop recipients (pure, tested)
  tipper-check.ts             Loads a creator's tipper signals and classifies them
  profile-visibility.ts       What the public profile shows (the "What people see" options)
  tipvault.ts                 TipVault ABI + handle hash
  money-client.ts             Browser: useSendTip, useWithdraw, useBalance, useActivity, unconfirmed tip/withdrawal retries
  youtube.ts / kick.ts        Single-username platform lookups; YouTube subscriber count by channel ID
  username-resolve.ts         Handle -> channel ID (cached platform lookup) -> linked user or escrow
  rate-limit.ts               Per-user / per-IP API limits, counted in Postgres
  oauth.ts                    Signed-state helper for platform linking

contracts/
  src/TipVault.sol            Pending-tip escrow contract (claim by owner, refund after 30 days)
  test/TipVault.t.sol         Foundry unit tests
  test/TipVault.invariant.t.sol  Foundry invariant + fuzz tests
  script/Deploy.s.sol         Deployment script

tests/                        Vitest unit tests (npm test)

supabase/
  schema.sql                  Full database schema, for a new project
  migrate.sql                 Brings an existing database up to date with schema.sql
  functions.sql               Functions the API uses to record money movements
```

## Getting started

1. `cp .env.example .env.local` and fill in every value (each is explained
   in `.env.example`). Nothing deployment-specific -- keys, URLs, contract
   addresses -- is hardcoded in the code; it all comes from env vars or the
   Privy dashboard.
2. `npm install`
3. **Database** -- in the Supabase SQL Editor, run the whole file each time
   (nothing highlighted, so the editor doesn't run only a selection):
   - new project: `supabase/schema.sql`, then `supabase/functions.sql`
   - existing project: `supabase/migrate.sql`, then `supabase/functions.sql`

   All three are safe to run again. `functions.sql` needs the tables, so it
   always goes last.
4. **Contract** -- `cd contracts && forge install openzeppelin/openzeppelin-contracts forge-std`,
   then `forge test`.
5. Deploy `TipVault` with `forge script script/Deploy.s.sol` (see the comment
   at the top of that file), then put the deployed address in
   `TIPVAULT_CONTRACT_ADDRESS`. The owner address needs a little MON -- it
   pays gas for escrow claims.
6. Set up gas sponsorship and the background job (below).
7. `npm test`, then `npm run dev` and open `http://localhost:3000`.

After pulling changes that touch `supabase/`, run `migrate.sql` then
`functions.sql` again on your existing database (both are safe to re-run).

## Gas-free transfers setup

Tips are sent by each user's own smart wallet from the browser, with gas paid
by a paymaster. No bundler or paymaster URL or key goes in env vars or code --
they live in the Privy dashboard.

1. **Pimlico** (dashboard.pimlico.io):
   - create an API key;
   - set up billing -- mainnet sponsorship is paid, and without it every
     send fails with `AA21 didn't pay prefund`;
   - add a **sponsorship policy** for Monad mainnet with a daily and
     per-wallet spending cap, and restrict the key to your app's domain if
     the setting is available (the key is visible in the browser).
2. **Privy dashboard** -> your app -> Smart wallets: turn on, wallet type
   **Kernel**, and add a **custom chain** for Monad mainnet with your Monad
   RPC URL and Pimlico's Monad bundler and paymaster URLs (both are the same
   Pimlico RPC URL for the Monad chain).
3. **Check it** before testing in the app: `eth_supportedEntryPoints` against
   the Pimlico URL must list the EntryPoint v0.7 address, and `eth_chainId`
   must return Monad mainnet's chain ID.
4. Existing users: sign out and back in so `/api/me` stores the **smart
   wallet** address (funds live there, not in the embedded signer). Sign-in
   waits for the smart wallet; it never stores the embedded wallet instead.

## Escrow claim signer

Releasing escrow (`TipVault.claim`) must be signed by the TipVault owner.
Two options, set in env vars (see `.env.example`):

- **Privy server wallet (recommended).** The key lives with Privy, never in
  this app's environment, and a policy can restrict it to one action.
  1. In the Privy dashboard, create an Ethereum server wallet (with an
     authorization key as its owner, so only requests signed with that key
     can use it).
  2. Attach a policy that allows only transactions to your TipVault address
     calling `claim`, on Monad mainnet, and denies everything else.
  3. Fund the wallet with a little MON (it pays gas for claims).
  4. Move TipVault ownership to the server wallet, signed once by the
     current owner key (from `.env.local`):
     `node scripts/transfer-tipvault-ownership.mjs <server wallet address>`.
     It checks the key is the current owner and the address is valid, asks
     you to type the end of the address, sends the transfer and reads the
     new owner back. This can't be undone by the old key.
  5. Set `PRIVY_CLAIM_WALLET_ID` and `PRIVY_CLAIM_AUTHORIZATION_KEY`
     (Production only), redeploy, and link a test channel with a small
     escrowed tip to check a claim goes through. Then remove
     `TIPVAULT_OWNER_PRIVATE_KEY`.
  This path (`sendClaimWithPrivyWallet` in `lib/wallet-server.ts`) has
  been verified with a live claim on Monad mainnet. The claim wallet pays
  its own gas, so keep a little MON in it.
- **Raw private key** (`TIPVAULT_OWNER_PRIVATE_KEY`) -- used when
  `PRIVY_CLAIM_WALLET_ID` is empty. Scope it to Production only.

Whichever signs can release all escrow, so keep escrow balances modest.
Redeploying TipVault with a claim-only role, two-step ownership and a claim
delay/cap would limit that further (see TODOs).

## Background job

`GET /api/cron/reconcile` records tips whose confirmation was missed and
finishes escrow claims. It must run about once a minute.

1. Generate a secret (at least 16 random characters, e.g.
   `openssl rand -hex 32`) and set it as `CRON_SECRET` in your hosting env
   (then redeploy) and in `.env.local`. The route refuses every call without
   it.
2. Schedule it. Vercel's Hobby plan only allows daily crons, so dripp uses
   Supabase: enable the `pg_cron` and `pg_net` extensions, store the secret in
   Supabase Vault, and schedule a job that calls the route with
   `Authorization: Bearer <secret>`:

   ```sql
   -- once, with your real secret
   select vault.create_secret('<your CRON_SECRET>', 'cron_secret');

   -- every minute
   select cron.schedule('dripp-reconcile', '* * * * *', $job$
     select net.http_get(
       url := 'https://<your-production-domain>/api/cron/reconcile',
       headers := jsonb_build_object('Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       timeout_milliseconds := 30000);
   $job$);
   ```

3. Check it: `select status_code, content from net._http_response order by created desc limit 5;`
   should show `200` and `{"claimsUnsettled":false,"scannedTo":...,"recorded":0}`.
   `401` means the Vault secret and `CRON_SECRET` don't match.

On Vercel Pro, a Vercel Cron works too (it sends the same header).

## Testing a tip end to end

Use two Google accounts: **A** (sender) and **B** (owns a YouTube channel
with a handle). Fund A's **smart wallet** with a little USDC (its address is
`users.wallet_address` in Supabase, or the user's smart wallet in the Privy
dashboard -- the app never shows addresses).

1. B signs in once but doesn't link YouTube. A tips B's handle $0.01 ->
   "sent", and A's Activity shows it waiting.
2. B links YouTube (Profile for a viewer, the Creator page for a creator) ->
   lands back there with the amount collected; A's entry turns "Collected".
3. A tips B's handle again -> goes straight to B.

After each step, `tip_intents.confirmed_at` should be filled, and
`pending_tips` / `escrow_claims` / `tips` should show the tip. If a send
fails, the real error is in the browser console under
`smart wallet send failed`.

## Why there's no NextAuth

Privy is the primary auth system (Google login + wallet in one step).
Platform linking (YouTube/Kick, for Creator Mode) uses a small custom OAuth
flow with a signed state and a browser-bound nonce cookie instead of layering
NextAuth on top (see the comment at the top of `lib/oauth.ts`).

## Deliberately left as TODOs, not built

- Mercuryo onramp/offramp: Add Money (wallets are funded externally for
  now) and cash-out to a bank or card. Withdrawing to a wallet address is the
  stand-in, offered only to the accounts in `WITHDRAW_TO_ADDRESS_EMAILS`.
- Refunding when the sender never opens the app again: the current
  contract only lets the sender's own wallet call `refund()`, so returns
  happen on their next visit. An owner-triggered refund needs a redeploy.
- Kick linking (the callback returns "not yet implemented")
- In-app usernames: only YouTube/Kick handles can be tipped, so someone who
  hasn't linked a channel can't receive tips yet (anyone can link one --
  viewers on Profile, creators on the Creator page)
- Funding-source clustering for the bot check (needs an onchain indexer).
  The bot/real breakdown and the reward-drop filter are built on account,
  channel and timing signals (`lib/bot-check.ts`); `bot_scores` is unused.
- Row Level Security *policies* in Supabase -- RLS itself is enabled on
  every table and the browser never talks to Supabase directly (only the
  server, with the service-role key); add narrow policies only if that
  changes
- Further escrow hardening (a per-claim cap or delay, two-step ownership).
  Doesn't need a TipVault redeploy: make a small guard contract the owner and
  let the Privy server wallet claim only through it.
- Google profile pictures: Privy doesn't expose them, so avatars come from a
  linked channel and fall back to initials
