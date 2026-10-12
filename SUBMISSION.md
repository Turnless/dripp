# Submission: Monad Metropolis, Consumer Products & Payments

Deadline: **Oct 14, 2026, 04:59 GMT+1**. Prize: $30,000, split evenly among
3 winners ($10,000 each). One primary track per project: set this track as
primary in the dashboard.

## Deliverables

- [ ] **Project logo/graphic** -- JPG, JPEG, PNG or WEBP, max 3MB
      (dripp-logo.png, 1024x1024, the app icon)
- [x] **Public GitHub repository** -- fully accessible by
      `metropolis@hackathon.monad.xyz`: https://github.com/Turnless/dripp
      (make it public, or invite that address)
- [x] **Technical demo video** -- max 3 minutes, on **YouTube, Loom or Vimeo**
      (an X post doesn't count), showing the live working product, not slides
      or code: https://youtu.be/ceN2N5Winp8
- [x] **Pitch video** -- max 2 minutes: the team, the problem, why you're
      building it: https://youtu.be/s4N8itrQBrQ
- [x] **Live product link** -- on Monad mainnet, with access instructions and
      test login credentials for judges: https://getdripp.vercel.app; judges sign in
      with their own Google account (no test credentials needed)
- [ ] **Product advertisement** (optional, not judged) -- max 30 seconds:
      TODO link

## Form answers

**Name:** dripp

**One line:** Tip any streamer in dollars, even before they've joined;
it settles in USDC on Monad and nobody sees a wallet.

**Description:** Live-stream viewers already pay creators, but through
platform tips that take a cut and lock money to one platform. dripp lets
anyone sign in with Google and tip a YouTube handle or dripp username in
dollars. Each tip settles in native USDC on Monad mainnet from a
gas-sponsored smart wallet. If the creator hasn't joined yet, the money waits
in the TipVault escrow contract, keyed to their channel ID, until they link
the channel, and goes back to the sender after 30 days if nobody claims it.

**Who it's for:** Streamers first, especially small ones, whom platform tipping
serves worst; then community leaders who reward members (bulk sends with a
bot check), and individuals sending money by username. None of them need to
think of themselves as crypto users.

**Traction:** Honest status: the full flow (tips, escrow deposits, escrow
claims) works on Monad mainnet with real USDC, tested with our own accounts.
No outside streamers are using it yet. Next: onboard five small YouTube
streamers, each adding the on-stream tip alert, so their viewers become the
next users.

**How it uses Monad:** native Circle USDC on Monad mainnet for every tip;
Kernel smart wallets with a Pimlico paymaster so users pay no gas; the
TipVault escrow contract for tips to creators who haven't joined.

**Go-to-market and user acquisition:**

dripp starts with one group: small YouTube streamers, the creators today's
tipping serves worst (Twitch holds earnings until $100, and card fees take
almost a third of a $1 tip). Every new user after them comes through
something already built into the product.

1. Five streamers, onboarded by hand. dripp has no outside streamers yet,
   so the first step is direct outreach to small YouTube streamers: help
   each one link their channel, add the dripp tip alert to OBS (one browser
   link) and put their dripp page (getdripp.vercel.app/u/username) in their
   stream description and panels.
2. Their viewers. A tip alert on stream shows the whole chat that tipping
   works and takes seconds. A viewer who wants to tip signs in with Google
   and sends; no wallet or crypto step to lose them. Each streamer is a
   distribution channel to their own audience.
3. Tips that wait. A viewer can tip any YouTube creator, even one who has
   never heard of dripp. The tip waits in escrow for 30 days, so the
   creator has money to collect and a reason to join, and brings their own
   audience when they do. This turns viewers into the people who recruit
   creators, which also fixes the cold start every tipping app has.
4. Community leaders. Moderators, organisers and people running giveaways
   can reward many members in one bulk send. The bot/real check stops fake
   accounts from farming a drop, so a reward reaches real people, and every
   person who receives one has an account and a balance to spend.

Why this can grow cheaply: sending a tip costs the user nothing (gas is
sponsored), and dripp earns 1% only when someone withdraws, so it makes
money only when real money has moved through it.

What we will measure: streamers with the tip alert live, viewers who send a
first tip, escrowed tips that get claimed, and how many new creators join
because a tip was waiting for them.

## Addresses (Monad mainnet)

| | Address |
|---|---|
| TipVault | [`0xF8B5DDE0D954cB2De3A3d17fecd81Dbfe00CC68d`](https://monadvision.com/address/0xF8B5DDE0D954cB2De3A3d17fecd81Dbfe00CC68d) |
| USDC (Circle, native) | `0xF77A90B291A6097A9eb9A90629E00A58F5E8FB90` |
| TipVault owner (Privy server wallet, claim-only policy) | `0x06545b4F72e42EFf3890516689FcEf2fd40E37d9` |
| Treasury (1% withdrawal fee) | `0xdEF6180703c449dcF05c48135f34F9CA6FCAdf1C` |

## Evidence

| | Link |
|---|---|
| Escrow deposit (0.5 USDC, gas sponsored) | https://monadvision.com/tx/0x8bd799f88de4bbcf758192a3a5557f84b2dc2d8e9b4d3985449058b4b00be8dc |
| Escrow claim (0.5 USDC, 2 min 17 s later) | https://monadvision.com/tx/0xc951aa89456d16958e3fe03e5f5765fe2dc1d0c70ff9455593b962ecbfbc3c98 |
| CI run | https://github.com/Turnless/dripp/actions/workflows/ci.yml |
