# Submission: Monad Metropolis, Consumer Products & Payments

Deadline: **Oct 14, 2026, 04:59 GMT+1**. Prize: $30,000, split evenly among
3 winners ($10,000 each). One primary track per project: set this track as
primary in the dashboard.

## Deliverables

- [ ] **Project logo/graphic** -- JPG, JPEG, PNG or WEBP, max 3MB
      (`app/icon.svg` exported to PNG works)
- [ ] **Public GitHub repository** -- fully accessible by
      `metropolis@hackathon.monad.xyz`: https://github.com/Turnless/dripp
      (make it public, or invite that address)
- [ ] **Technical demo video** -- max 3 minutes, on **YouTube, Loom or Vimeo**
      (an X post doesn't count), showing the live working product, not slides
      or code: TODO link
- [ ] **Pitch video** -- max 2 minutes: the team, the problem, why you're
      building it: TODO link
- [ ] **Live product link** -- on Monad mainnet, with access instructions and
      test login credentials for judges: https://getdripp.vercel.app + TODO credentials
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

**Who it's for:** TODO (same as README "Who it's for")

**Traction:** TODO (same as README "Traction")

**How it uses Monad:** native Circle USDC on Monad mainnet for every tip;
Kernel smart wallets with a Pimlico paymaster so users pay no gas; the
TipVault escrow contract for tips to creators who haven't joined.

## Addresses (Monad mainnet)

| | Address |
|---|---|
| TipVault | TODO |
| USDC (Circle, native) | TODO (from Circle's official list) |
| TipVault owner (Privy server wallet, claim-only policy) | TODO |
| Treasury (1% withdrawal fee) | TODO |

## Evidence

| | Link |
|---|---|
| First mainnet tip | TODO |
| First escrow deposit | TODO |
| First escrow claim | TODO |
| CI run | https://github.com/Turnless/dripp/actions/workflows/ci.yml |
