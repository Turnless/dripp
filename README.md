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
| Judge login | Your own Google account, no test credentials needed (see "Judge fast path") |
| Technical demo (≤3 min) | [youtu.be/ceN2N5Winp8](https://youtu.be/ceN2N5Winp8), filmed on the live app |
| Build-in-public post | [x.com/turnless_HQ](https://x.com/turnless_HQ/status/2103253352217817542) |
| TipVault (escrow) | [`0xF8B5DDE0D954cB2De3A3d17fecd81Dbfe00CC68d`](https://monadvision.com/address/0xF8B5DDE0D954cB2De3A3d17fecd81Dbfe00CC68d) (Monad mainnet) |
| Escrow deposit | [`0x8bd7…e8dc`](https://monadvision.com/tx/0x8bd799f88de4bbcf758192a3a5557f84b2dc2d8e9b4d3985449058b4b00be8dc) - 0.5 USDC tipped to a creator who hadn't joined, held in TipVault. Sent as a gas-sponsored UserOperation (the user paid no gas). Oct 11, 2026 |
| Escrow claim | [`0xc951…3c98`](https://monadvision.com/tx/0xc951aa89456d16958e3fe03e5f5765fe2dc1d0c70ff9455593b962ecbfbc3c98) - the creator linked YouTube and the 0.5 USDC was released to them by TipVault's owner, **2 min 17 s after the deposit**. Oct 11, 2026 |
| Cost to the user | $0 to tip (gas paid by the paymaster), 1% only when withdrawing |
| Tests | 126 Vitest + 20 Foundry (16 unit, 3 invariants, 1 fuzz), run in CI |
| Nothing simulated | Every tip, escrow deposit and claim is a real Monad mainnet transaction in native Circle USDC |

## Judge fast path

Five minutes, nothing to install, no wallet or keys. Sign in with your own
Google account; dripp creates everything else.

1. Open **[getdripp.vercel.app](https://getdripp.vercel.app)** and sign in
   with Google. Pick a username. You never see an address, a seed phrase or
   a gas prompt.
2. Go to **Send**, choose the **YouTube** tab and type any channel handle,
   for example a creator who has never heard of dripp. dripp finds the
   channel and shows "Hasn't joined yet" and "We'll hold it until they join
   and link their channel."
3. Your public page is at **getdripp.vercel.app/u/&lt;your username&gt;**.
   Choose what it shows under **Profile -> What people see**.
4. Open the **Creator** page: "Tip alerts on stream" (the OBS overlay link)
   and "Who's tipping you" (verified / not verified / suspicious tippers).
5. A new account starts at $0, so the full money flow (a tip, an escrowed
   tip, the creator linking YouTube and collecting it) is shown in the
   [technical demo](https://youtu.be/ceN2N5Winp8), filmed on this live app.

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

dripp is for people who get paid by a community, starting with the one the
product is built around:

1. **Streamers, especially small ones.** They are the ones platform tipping
   serves worst: payout thresholds hold their money back, fixed card fees
   eat small tips, and fans can't tip them on a new app until they sign up.
   dripp's escrow is built for exactly this: fans can tip them first, and
   the money waits until they claim it.
2. **Community leaders** who reward members: moderators, organisers,
   people running giveaways. Bulk sends tip many people at once, and the
   bot/real check stops fake accounts from farming a reward drop.
3. **Individuals** sending each other money by username, with no bank
   details and nothing to install.

All three are people who don't think of themselves as crypto users. They
sign in with Google and see dollars.

## Traction

Honest status: dripp has been in build until now. The full flow (tips,
escrow deposits, escrow claims) has been tested on Monad mainnet with our
own accounts and real USDC, but **no outside streamers are using it yet**.

## The next 100 users

1. **Five streamers first.** Onboard five small YouTube streamers we can
   reach directly. Each one links their channel, adds the OBS tip alert to
   their stream, and shares their dripp page.
2. **Their viewers are the next users.** Every tip alert on stream shows
   viewers that tipping works, and every tipper signs up to send one.
3. **Tips that wait bring creators in.** A viewer can tip a creator who
   isn't on dripp yet; that creator has a reason to join and collect it,
   and brings their own audience.
4. **Community rewards.** One community leader rewarding their members
   with a bulk send puts dripp in front of everyone who receives one.

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
