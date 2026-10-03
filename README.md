# dripp - tip any streamer in dollars, settled in USDC on Monad

[![CI](https://github.com/Turnless/dripp/actions/workflows/ci.yml/badge.svg)](https://github.com/Turnless/dripp/actions/workflows/ci.yml)
![Monad mainnet](https://img.shields.io/badge/Monad-mainnet-836EF9)
![USDC](https://img.shields.io/badge/settles%20in-native%20USDC-2775CA)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

**Monad Metropolis** · Consumer Products & Payments · Monad mainnet, native USDC, Privy smart wallets, Pimlico paymaster

Live-stream viewers already pay creators, but through platform tips that take
a cut (YouTube keeps 30% of Super Chat), pay out on the platform's schedule,
and are locked to one platform. dripp lets
anyone tip a YouTube (or dripp) username in dollars: sign in with Google, pick
an amount, done. It settles in native USDC on Monad mainnet from a
gas-sponsored smart wallet, and if the creator hasn't joined yet, the money
waits in an onchain escrow (`TipVault`) until they link their channel, or goes
back to the sender after 30 days.

**No wallet, no gas prompt, no token ticker. Just dollars.**

| | |
|---|---|
| Live app | [getdripp.vercel.app](https://getdripp.vercel.app) |
| Judge login | TODO: test login for judges (see "Judge fast path") |
| Technical demo (≤3 min) | TODO: YouTube / Loom / Vimeo link, filmed on the live app |
| Pitch (≤2 min) | TODO: YouTube / Loom / Vimeo link |
| Build-in-public post | [x.com/turnless_HQ](https://x.com/turnless_HQ/status/2103253352217817542) |
| TipVault (escrow) | `0xF8B5DDE0D954cB2De3A3d17fecd81Dbfe00CC68d` (Monad mainnet) |
| First mainnet tip | TODO: explorer link - amount, Monad mainnet, date |
| First escrow claim | TODO: explorer link - claimed by the Privy server wallet after a YouTube link |
| Cost to the user | $0 to tip (gas paid by the paymaster), 1% only when withdrawing |
| Tests | 126 Vitest + 20 Foundry (16 unit, 3 invariants, 1 fuzz), run in CI |
| Nothing simulated | Every tip, escrow deposit and claim is a real Monad mainnet transaction in native Circle USDC |

## Judge fast path

Five minutes, nothing to install, no wallet or keys.

1. Open **[getdripp.vercel.app](https://getdripp.vercel.app)** and sign in with the judge account
   (**TODO: test login**). It already holds a few dollars, so you can tip
   straight away. You never see an address, a seed phrase or a gas prompt.
2. Go to **Send**, choose the **YouTube** tab and type any channel handle
   (e.g. one that has never heard of dripp). dripp resolves it to the
   channel ID and tells you the tip will wait in escrow until they join.
3. Open a public profile at **getdripp.vercel.app/u/&lt;username&gt;** and the OBS
   overlay at **getdripp.vercel.app/overlay/&lt;username&gt;**: this is what a
   streamer puts on screen; tips appear live.
4. Send a real $0.10 tip to **TODO: demo creator username** on the **dripp** tab, then open
   **Activity**: the tip is there, in dollars. (The matching Monad
   transactions for our own test tips are linked in the table above.)
5. Check the bot/real breakdown on the **Creator** page: who tipped is
   classified as verified, not verified or suspicious before any reward drop.

## The problem

- Platform tipping (Super Chat, Bits) takes a cut, is locked to one
  platform, and pays out on the platform's schedule.
- Crypto tipping fixes the rails but loses the viewer at "connect wallet",
  "buy gas" and "which token?".
- Nobody can tip a creator who isn't already on the tipping app, so every
  new tipping product starts empty.

## How it works

```
 Viewer (Google sign-in)                                     Monad mainnet
 ──────────────────────                                      ─────────────
 1. Send $2 to @creator ──► /api/tip/prepare
                             resolve handle -> channel ID
                             save tip intent (who, what, how much)
                             return calls
 2. Smart wallet (Kernel) ──── one gas-sponsored UserOp ───► creator joined?
    no popup, paymaster pays                                   yes: USDC.transfer
                                                               no:  approve + TipVault.depositPending
 3. /api/tip/confirm ◄──── read the tx logs, match against the saved intent,
                           record once (each log backs one record)
 4. Creator links YouTube ──► OAuth proves the channel ──► Privy server wallet
                                                           (policy: TipVault.claim only)
                                                           TipVault.claim -> creator
 5. Nobody claims in 30 days ──► sender's wallet calls TipVault.refund (gas-free)
```

Every minute a reconcile job records any tip, refund or claim whose
confirmation the browser missed, straight from the chain.

## Why escrow and not "creator must sign up first"

A tip that needs the recipient to already have an account can't be sent to
most creators, so the product never gets started. With `TipVault`, a viewer
can tip any YouTube handle today. The money is keyed to the **channel ID**
(not the handle, which can be renamed or reassigned), held onchain, released
only after the creator proves the channel with Google OAuth, and returned to
the sender if nobody claims it.

## Why deterministic checks and not "trust the browser"

The browser sends the money, but it never decides what gets recorded:

- **Intent first.** The server saves who, what and how much before anything
  is sent, and confirms against that intent, never by re-resolving the
  recipient.
- **Onchain logs are the truth.** A tip is recorded only if the transaction's
  logs match the intent; each log can back exactly one record (`chain_logs`).
- **Never pay twice.** Once money has moved, the app never offers to send it
  again; unconfirmed tips are retried from the browser and by the reconcile
  job.
- **Least-privilege claim key.** The escrow owner is a Privy server wallet
  whose policy allows only `TipVault.claim` on Monad mainnet.

## Consumer Products & Payments: criteria and evidence

The track asks: *what does a financial product look like when onchain rails
are leveraged as an advantage to design?* Its first suggested idea is
"payments embedded in social gestures ... tipping a creator -- where the
financial action feels like a message, not a transaction". dripp is that,
plus the one thing onchain rails make possible and platforms can't: tipping
someone who isn't on the app yet.

| Criterion (weight) | Evidence in dripp |
|---|---|
| **Technical Execution (20%)** -- mechanics execute onchain with real conditional logic and settlement | `TipVault` holds a tip **on the condition** that the creator proves their channel (released by `claim` after OAuth) and returns it **on the condition** that 30 days pass unclaimed (`refund`). Native USDC on Monad mainnet, tx links above. Server records nothing it can't match to onchain logs. 20 Foundry tests including 3 invariants. |
| **Design & Craft (20%)** -- a non-crypto user completes the core flow; the blockchain is invisible | Google sign-in, no addresses, no gas prompts (`showWalletUIs: false`, paymaster pays), amounts in dollars and cents, recipients by YouTube handle or dripp username. Crypto words appear only if the user switches on "I use a crypto wallet" in Profile (off by default). |
| **Originality & Track Insight (15%)** -- new consumer experience, not a rebranded wallet | Tip any creator **before they join**: the money waits onchain, keyed to their channel ID, until they link it. Platform tips can't do this, and most tip apps start empty because the creator has to sign up first. |
| **Founder & Market Readiness (25%)** -- a specific, named consumer segment and real understanding of it | See [Who it's for](#who-its-for). |
| **Traction & Path Forward (20%)** -- user testing and a concrete plan for the next 100 users | See [Traction](#traction) and [The next 100 users](#the-next-100-users). |

## Who it's for

TODO (the highest-weighted criterion, 25%): name one specific segment and
what you know about them. For example: who the viewers are, which creators
they watch, how they tip today, what it costs them, and why the current
options fail them. Use what you've seen first-hand.

## Traction

TODO: the people who have tried it so far: how many, who they are, what
they did (tips sent, total value, creators who claimed), and what you
changed because of their feedback. Even five friends counts; link the
mainnet transactions.

## The next 100 users

TODO: a concrete plan: which creators you'll onboard first, how their
viewers find dripp (the OBS overlay on stream, "tip me on dripp" links,
tips waiting for creators who haven't joined), and the numbers you expect.

## What is real and what is not

**Real, verified on Monad mainnet:** Google sign-in with a gas-sponsored smart
wallet; tips between two users; escrow deposits; releasing escrow when a
YouTube channel is linked, signed by the Privy server wallet.

**Built, not yet exercised on mainnet:** 30-day refunds, bulk sends, the
reconcile job, the crypto deposit/withdraw option, the OBS overlay, the live
subscriber count.

**Not built:** card and bank on/off-ramp (Mercuryo, shown as "coming soon"),
Kick linking (the callback returns "not yet implemented"), phone verification
is built but switched off until Twilio is paid for.

## Threat model

| Threat | Mitigation |
|---|---|
| Handle renamed or reassigned to send money to the wrong person | Escrow keyed by channel ID, resolved at tip time and saved in the intent |
| Forged or replayed confirmation | Confirm reads the tx logs onchain and matches them to the saved intent; each log backs one record |
| Double-spend from a retry | Sent tips are never re-offered; retries only confirm |
| Claim key compromise | Privy server wallet, policy limited to `TipVault.claim`; key never in app env. Escrow balances kept modest |
| Claiming someone else's channel | Claim only after Google OAuth with signed state and a browser-bound nonce (`lib/oauth.ts`) |
| Claimed money also refunded | Per-round accounting in `TipVault`; fuzz test `testFuzz_claimThenRefund_alwaysReverts` |
| Bots farming reward drops | Viewer verification (YouTube check, $1+ tip, phone) and a swarm check (`lib/bot-check.ts`) |
| API abuse / SMS pumping | Per-user and per-IP limits in Postgres; strict phone-code caps (`lib/rate-limit.ts`) |
| Database exposure | RLS on every table; the browser never talks to Supabase, only the server |

## Tests and scripts

```bash
npm test                 # 126 Vitest tests: money math, onchain log checks, confirm route,
                         # OAuth state, lookups, rate limits, refunds, usernames, bot rules
cd contracts && forge test   # 20 Foundry tests, including 3 invariants:
                         # escrow == senders' contributions == vault balance
```

Both run on every push and pull request ([CI](.github/workflows/ci.yml)).

## Running it, configuration, deploying

The full developer guide (env vars, Supabase schema, deploying `TipVault`,
gas sponsorship with Pimlico and Privy, the escrow claim signer, the
reconcile cron, testing a tip end to end) is in
[`docs/README.md`](docs/README.md).

```bash
cp .env.example .env.local   # fill in every value
npm install
npm test && npm run dev
```

## Honest limits

- `TipVault` is **unaudited**. The owner can release any escrow, so escrow
  balances are kept modest. The owner is a policy-restricted Privy server
  wallet, but it is still a trusted backend.
- Refunds need the sender to open the app again; an owner-triggered refund
  needs a contract redeploy.
- Deposits from external wallets are watched for up to 1000 accounts before
  an indexer is needed.
- Kick lookups are written against Kick's newer public API and still need to
  be checked against its current docs.

## Roadmap

- Card and bank on/off-ramp so creators cash out to their bank.
- Kick and Twitch linking.
- A guard contract in front of `TipVault`: claim-only role, per-claim cap and
  delay, two-step ownership.
- Signature-based (EIP-712) claims, so the contract needs no privileged caller.

## License

[MIT](LICENSE)
