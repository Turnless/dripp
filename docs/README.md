# dripp -- cross-platform live tipping on Monad

Viewers tip streamers (and streamers reward viewers) with real dollars that
settle in native USDC on Monad mainnet, without ever seeing a wallet, a gas
prompt or a token ticker. Sign-in is Google via Privy; each user gets a
gas-sponsored smart wallet; tips to creators who haven't joined yet are held
in the `TipVault` escrow contract until they link their channel.

The product and design docs (`03-product-requirements-document.md`,
`04-architecture.md`, `design.md`) live in `docs/` locally and are not
published; this README covers the code.

## Status

**Verified on Monad mainnet**
- Google sign-in with an invisible, gas-sponsored smart wallet (Privy smart
  wallets, Kernel account; bundler + paymaster from Pimlico).
- Sending tips between two users, gas paid by the paymaster.

**Built, confirm on mainnet before relying on it**
- Releasing escrowed tips when a creator links their YouTube channel.
- Bulk sends (the same path as a single tip, once per recipient).
- The background recovery job (records tips whose confirmation was missed,
  finishes escrow claims).
- The OBS overlay.

The recording logic (`supabase/functions.sql`) and the onchain checks in
`lib/wallet-server.ts` were also tested against a local Postgres and a local
EVM node running the real `TipVault.sol`.

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

1. **Prepare** -- `/api/tip/prepare` resolves the recipient (own database
   first, then a single YouTube/Kick lookup), saves a **tip intent** (who,
   what, how much) and returns the calls for the smart wallet.
2. **Send** -- the browser's smart wallet sends the calls as one
   gas-sponsored operation (no popups: `showWalletUIs: false`). A direct tip
   is a USDC `transfer`; a tip to someone who hasn't joined is `approve` +
   `TipVault.depositPending`.
3. **Confirm** -- `/api/tip/confirm` checks the transaction's logs onchain
   against the saved intent (never re-resolving the recipient) and records
   it through `record_tip` in `supabase/functions.sql`. Each onchain log can
   back only one record in any table (`chain_logs`).
4. **Never pay twice** -- once the money has moved, the app never offers to
   send again. If confirming fails it retries, keeps the tip in the
   browser's storage and retries on the next load, and the reconcile job
   records anything still missing from the chain.
5. **Claim** -- when a creator links their channel, the backend sends
   `TipVault.claim` (signed by the TipVault owner key), writes it to
   `escrow_claims` straight away, and marks as collected exactly the
   deposits that claim released, from its receipt.

Tips are free; the only fee is 1% on withdrawals (`lib/fees.ts`).

## Project layout

```
app/                          Next.js App Router
  (app)/                      Signed-in app: Money, Activity, Creator, Profile
  providers.tsx               Privy + SmartWalletsProvider (gas-free sending)
  overlay/[username]/         OBS browser-source page (?platform=youtube|kick)
  api/
    me/                       POST sign-up/sync, PATCH viewer/creator mode
    tip/prepare/              POST -- save a tip intent, return the calls for the smart wallet to send
    tip/confirm/              POST -- verify the tx onchain against the intent, then record the tip
    withdraw/prepare|confirm/ POST -- payout + 1% fee in one operation (UI waits on Mercuryo)
    balance/                  GET -- balance in cents
    activity/                 GET -- history (tips, escrow, withdrawals)
    username/resolve/         GET -- check if a username exists/is verifiable
    platform/link/[provider]  POST (Privy token) -- returns the OAuth URL to link YouTube/Kick
    platform/callback/[provider]  GET -- finish OAuth, release escrowed tips
    overlay/events/[username] GET (SSE) -- live tip alerts for the overlay
    cron/reconcile/           GET (CRON_SECRET) -- record tips confirm missed, finish escrow claims

lib/
  chain.ts                    Monad chain definition + USDC constants (from env)
  supabase.ts                 Browser + server Supabase clients
  wallet-server.ts            Server chain helpers: balance, verify transfers, escrow claims, log scans
  escrow-claims.ts            Send TipVault.claim and mark exactly the tips it released
  tip-plan.ts                 Where a tip goes + the exact calls (saved as a tip intent by prepare)
  withdraw-plan.ts            Withdrawal calls: 1% fee to treasury + payout, batched
  tipvault.ts                 TipVault ABI + handle hash
  money-client.ts             Browser: useSendTip, useBalance, useActivity, unconfirmed-tip retries
  youtube.ts / kick.ts        Single-username platform lookups
  username-resolve.ts         DB-first, platform-API-fallback resolution logic
  oauth.ts                    Signed-state helper for platform linking

contracts/
  src/TipVault.sol            Pending-tip escrow contract (claim by owner, refund after 30 days)
  test/TipVault.t.sol         Foundry test suite
  script/Deploy.s.sol         Deployment script

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
7. `npm run dev` and open `http://localhost:3000`.

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
2. B switches to Creator (Profile), links YouTube -> lands on Creator with the
   amount collected; A's entry turns "Collected".
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

- Withdraw UI / Mercuryo offramp integration (the fee-collecting withdraw
  API exists; the sheet stays disabled until Mercuryo supplies a destination)
- Add Money (onramp) -- wallets are funded externally for now
- "Get it back" button for TipVault refunds (the contract supports refunds
  30 days after a sender's latest deposit if the creator hasn't claimed; the
  app doesn't call `refund()` yet)
- Kick linking (the callback returns "not yet implemented")
- In-app usernames: only YouTube/Kick handles can be tipped, so a viewer who
  hasn't linked a channel can't receive tips yet
- The bot/real breakdown dashboard (`bot_scores` table exists, nothing
  populates it yet)
- Rate limiting on the API routes
- Row Level Security *policies* in Supabase -- RLS itself is enabled on
  every table (deny-all for the public anon key); add narrow policies only if
  the browser ever needs direct table access
