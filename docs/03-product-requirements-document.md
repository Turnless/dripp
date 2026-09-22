# Product Requirements Document

**Project name:** dripp
**Track:** Consumer Products & Payments (Monad hackathon)
**Chain:** Monad (mainnet)
**Primary asset:** Native USDC
**Status:** Pre-build / planning

---

## 1. Overview

A cross-platform live-tipping product that lets viewers and streamers send each other real money — instantly, with no visible blockchain, gas fees, or wallet setup — while embedding fraud/bot-resistance directly into the platform rather than adding it after the fact.

The product is built on Monad specifically because it is the first EVM-compatible chain fast and cheap enough (~800ms finality, sub-cent fees) to make instant micro-tipping viable without leaving the EVM ecosystem — a limitation that forced the two closest prior attempts (StreamQubic, Flowmoji) into a non-EVM chain and off-chain payment channels, respectively. See `01-problem-and-failures.md` for the full historical analysis and `02-differentiation.md` for point-by-point differentiation.

### Core question this product answers
*What does a financial product look like when onchain rails are leveraged as a design advantage, not just a settlement mechanism?*

### One-line pitch
Real, instant, cross-platform creator tipping — that never looks or feels like crypto.

---

## 2. Target user / market segment

**Primary segment (to be confirmed and named precisely before submission):** small-to-mid streamers who are underserved by existing payout infrastructure — e.g., streamers below mainstream platform payout thresholds (Twitch requires a $100 minimum balance before payout), or creators facing multi-day settlement delays and disproportionate cross-border card/PayPal fees on small tip amounts.

**Why this segment, not "streamers" broadly:** every predecessor studied in `01-problem-and-failures.md` pitched "creators" or "streamers" as an undifferentiated group. The hackathon's Founder & Market Readiness criterion explicitly penalizes "everyone needs payments"-style framing and rewards a named segment with a specific, understood pain point. This needs to be locked to one precise group before the pitch is finalized.

**Secondary user:** the viewer/tipper — who may never think of themselves as a "crypto user" at all. The product's design bar (see Section 6) is that this user never needs to know a blockchain is involved.

---

## 3. Goals

1. Let any user tip any other user — by platform or in-app username — with real USDC, settling in under a second, with zero visible crypto UX.
2. Let a user receive tips before they've ever signed up, and claim them automatically the moment they verify their identity.
3. Let streamers reward viewers/subscribers the same way viewers reward streamers — one shared system, bidirectional.
4. Give creators visibility into how much of their support is from real, unique people versus suspicious/bot activity.
5. Generate enough revenue (via disclosed fee + onramp referral share) to sustainably maintain the product post-hackathon — not to maximize revenue, just to cover it.

## 4. Non-goals (explicitly out of scope)

- **Quadratic funding / matching pools** — originally scoped, explicitly dropped for this build. May be revisited in a future version; not part of this PRD.
- **Multi-platform parity at launch** — full API integration (subs, verification, real-time data) will be built for one streaming platform first (see Section 8.3); others are "connect your account" only, with full feature parity as a fast-follow, not a launch requirement.
- **Full offramp-to-bank in the initial build**, if it proves too heavy for the hackathon timeline — a documented fallback (withdraw to an external wallet address) is acceptable if flagged honestly in the pitch as a fast-follow rather than presented as complete.
- **Support for USDT/USDT0** — deferred. USDT on Monad currently exists only as USDT0, a LayerZero-bridged (not natively issued) token with under $5M in combined liquidity across its top pools at time of writing. USDC is native, Circle-issued, and far deeper — it is the only asset supported at launch.

---

## 5. User stories

| As a... | I want to... | So that... |
|---|---|---|
| Viewer | Sign up with my Google account | I don't have to create or manage a crypto wallet |
| Viewer | Add money with my card or Apple Pay | I can fund tips without buying crypto myself |
| Viewer | Tip a streamer by their platform username, even if they've never signed up | I can support them the moment I decide to, not whenever they join |
| Streamer | Link my streaming account and get verified | Viewers trust that my profile is really me |
| Streamer | See my real-time sub count | I don't have to switch tabs to check my own platform dashboard |
| Streamer | See how many of my tippers look like real people vs. bots | I understand the real reach of my support base |
| Streamer | Send a bulk reward to a list of subscribers in one action | I don't have to tip each person individually |
| Any user | See a full history of what I've sent and received | I can track my own activity transparently |
| Any user | See how much a creator has publicly received/paid out | I can trust the platform is transparent, not opaque |
| Developer/operator | Take a small, disclosed fee when money is withdrawn (tips themselves are free) | The product can sustain its own infrastructure costs without taxing every tip |

---

## 6. Design principle (non-negotiable, tied directly to judging criteria)

**The blockchain must be completely invisible in every core user-facing flow.** No wallet addresses, no token tickers, no gas prompts, no seed phrases, no MetaMask popups, anywhere in the tipping, withdrawal, or sign-up flow. Balances are always shown in dollars. This directly maps to the hackathon's Design & Craft criterion, which explicitly states: *"judge harshly on any point of friction that reveals 'this is crypto.'"*

**Exception:** the platform's own fee is shown plainly at withdrawal time (e.g., "You withdraw $50.00 · fee (1%) $0.50 · you receive $49.50"). Tips are free: the creator gets the full amount sent. This is a pricing-transparency decision, not a crypto-jargon leak — Venmo, Cash App, and PayPal all disclose fees openly while remaining simple, mainstream products.

---

## 7. Feature list

### 7.1 Shared account (every user, no distinction between "streamer" and "viewer" account types)
- Sign up via Google — an embedded wallet is created invisibly and linked to the account.
- **Add Money** (onramp: card / Apple Pay / Google Pay → USDC lands directly in the user's Monad wallet).
- **Withdraw** (offramp: USDC converted back to cash, sent to card/bank; external-wallet withdrawal as a fallback path if full offramp isn't ready by submission).
- **Tip** any user by in-app username or linked platform username — including users who haven't signed up yet (see 7.3).
- **History tab** — full log of tips sent and received, with timestamp and counterparty.
- **Public profile** — total tipped out and total received, public by default (toggleable to private), functioning as a trust/transparency signal.

### 7.2 Creator Mode (unlocked by linking a streaming platform account via OAuth)
- **Verified badge** — awarded automatically the moment OAuth verification succeeds; no manual review process for the hackathon build. (Future: tiered badges based on sub-count thresholds.)
- **Real-time sub count** — pulled live from the linked platform's API. Scoped to one platform fully at launch (see Section 8.3); other platforms show "connect account" without full live data initially.
- **Bot/real breakdown** — shows what proportion of the creator's *tippers* (not raw platform followers, which the platform's API doesn't expose data on) appear to be real, unique people versus suspicious/duplicate activity, based on the same lightweight sybil-signal check used to gate the reward-drop flow (Section 7.4).
- **Bulk / rule-based sending** — a streamer can split an amount across a list of usernames in one action (e.g., "$50 across everyone who subscribed tonight"). This is the platform's clearest demonstration of "programmable money responding to behavior in real time," directly answering the track's stated core question.

### 7.3 Tip-before-signup / claim flow
- A tip sent to a platform username that hasn't joined yet is held in a labeled pending state, not lost or bounced.
- When that person signs up and verifies the same platform account via OAuth, all pending tips under that verified username are released into their new wallet automatically.
- This mirrors the established Cash App / Venmo pattern of sending money to a phone number that hasn't joined the app yet.
- **Strategic value:** this creates an organic distribution loop — a viewer can start tipping a creator today even if that creator has never heard of the platform, giving the creator a concrete reason to sign up ("you have $40 waiting"). This directly feeds the hackathon's Traction & Path Forward criterion.

### 7.4 Bidirectional tipping (streamer → viewer/subscriber)
- Uses the exact same wallet, tipping, and claim infrastructure as viewer → streamer tips — no separate system.
- Supports both a single send and the bulk/rule-based send described in 7.2.
- The same lightweight bot-check used for the creator's "bot/real" dashboard also applies here, to prevent viewbot-style accounts from being included in a streamer's reward drop.
- **Explicitly not** run through a quadratic-funding-style formula — that mechanic only makes sense for many-givers-to-one-receiver, which doesn't describe this direction. Kept as a simple, separate feature rather than forced into a shared formula.

---

## 8. Technical architecture

### 8.1 Settlement layer
- All balances, transfers, and history live on **Monad mainnet**. No multi-chain complexity in this version.
- Asset: **native USDC**, Circle-issued, mainnet contract `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`. Chosen over USDT0 due to native issuance and materially deeper liquidity.

### 8.2 Wallets and gas
- Embedded/social-login wallets created at Google sign-up (established pattern; e.g., Privy or equivalent provider), functioning as smart accounts capable of sponsored transactions.
- Gas sponsorship via a paymaster, so the end user never holds or thinks about MON (Monad's native gas token). Monad's own official x402 facilitator already bundles payment verification, settlement, and gas coverage as one service and can be built on directly rather than writing a custom paymaster from scratch.
- **Reserve balance consideration:** Monad's asynchronous execution model (consensus runs up to 3 blocks ahead of execution) enforces a per-account reserve-balance check to prevent overspending across in-flight transactions. A design implication for burst traffic (e.g., a viral bulk-send): route high-frequency sends through a small rotating pool of sub-wallets/session keys rather than a single hot wallet, to avoid reserve-balance-driven delays. This does not affect fund safety — Monad's parallel execution is guaranteed to produce results identical to strict sequential execution regardless — it is a throughput/liveness consideration only.

### 8.3 Onramp / offramp
- Card and Apple Pay/Google Pay deposits routed through an onramp provider with confirmed Monad support (e.g., Mercuryo, which already supports Apple Pay deposits directly into Monad wallets). Provider selection is a concrete build decision, not a formality — must be confirmed before implementation begins.
- Offramp mirrors the same provider relationship in reverse.
- Onramp providers commonly offer referral revenue share to integrating apps — a monetization lever (see Section 10) that requires no extra user-facing fee.

### 8.4 Platform (Kick / YouTube / etc.) integration
- **No platform exposes a bulk "list of all usernames" API**, for privacy and scale reasons — this was confirmed and is not a viable architecture. Two separate, correct patterns are used instead:
  1. **In-app username uniqueness** (at signup): a standard indexed lookup against the platform's own database — the same mechanism Instagram/X use, not something to avoid.
  2. **Verifying a not-yet-joined platform username** (for the tip-before-signup flow): a single, targeted lookup to the specific platform's public API at the moment it's needed — e.g., YouTube Data API's `channels.list` with the `forHandle` parameter resolves one handle to one channel record. Results are cached briefly to avoid repeated calls for a name tipped multiple times in one stream.
- **Launch scope:** fully wire up real-time data (sub count, OAuth verification) for **one** platform first (YouTube or Kick, to be finalized based on API accessibility during build) to avoid spreading integration effort too thin across three platforms' differing APIs and rate limits within the hackathon timeline. Other platforms remain connectable but with reduced live-data features, clearly labeled "coming soon."

### 8.5 Bot/sybil detection (lightweight version)
- Scope for this build: a lightweight heuristic check (e.g., wallet age, funding-source pattern) applied to (a) the creator-facing "bot/real breakdown" dashboard and (b) filtering a streamer's bulk reward-drop recipient list.
- Not scoped for this build: the more novel "re-execution/conflict fingerprint" signal explored in early research remains unvalidated and is not required for the current feature set now that quadratic funding is out of scope.

---

## 9. Judging criteria alignment

| Criterion | Weight | How this PRD addresses it |
|---|---|---|
| Technical Execution | 20% | Real onchain USDC transfers, real conditional logic (bulk/rule-based sends), real OAuth-gated claim flow — must be demoed live, not simulated |
| Design & Craft | 20% | Section 6's invisible-blockchain principle; dollars-only UI; no wallet/gas UI anywhere in core flow |
| Originality & Track Insight | 15% | Positioned explicitly against the documented graveyard in `01-problem-and-failures.md`; differentiation argued point-by-point in `02-differentiation.md`, not just asserted |
| Founder & Market Readiness | 25% | Requires finalizing one named, specific consumer segment (Section 2) before submission — currently the single most important open item in this PRD |
| Traction & Path Forward | 20% | Requires 3–5 real streamers actually testing the product before submission (not described as a future step), plus one concrete, named distribution channel for "the next 100 users" |

---

## 10. Monetization

1. **Disclosed withdrawal fee of 1%** (`WITHDRAWAL_FEE_BPS` in `lib/fees.ts`), shown clearly before a withdrawal is confirmed. Tipping itself is free, so small tips are never eaten by fees — the cost is paid once, when money leaves dripp.
2. **Onramp/offramp referral revenue** from the chosen provider — earned passively through infrastructure the product needs regardless.
3. *(Deferred, not part of hackathon scope)* a future "Creator Pro" tier for deeper analytics or custom branding.

Framing for judges: modest, disclosed revenue sufficient to cover infrastructure costs is the actual goal — not venture-scale returns. This is explicitly different from, and easier than, the bar that broke ChangeTip and TipJar, both of which needed to return venture capital, not just cover hosting costs.

---

## 11. Risks and open items

| Risk / open item | Notes |
|---|---|
| Target consumer segment not yet finalized | Highest-priority open item — worth 25% of judging alone |
| Onramp provider must be confirmed to support Monad specifically | Not all onramp providers support every chain; verify before building against one |
| Full bank offramp may not be ready by submission | Acceptable fallback: withdraw to external wallet address, disclosed honestly as a fast-follow |
| Only one platform gets full live-data integration | Must be framed as a deliberate scope decision in the pitch, not hidden as a gap |
| Sybil/bot detection is heuristic-only for this build | Acceptable given quadratic funding (the highest-stakes use of this signal) has been descoped |
| No real user testing has occurred yet | Must be completed (3–5 real streamers, real or test stream) before submission — required by Traction & Path Forward criterion |
| Money-transmission/regulatory exposure at real scale | Not legal advice — flagged for awareness; a pure wallet-to-wallet architecture (no custody by the platform) is the lower-risk design default and is what this PRD assumes throughout |

---

## References

Full source list for all historical, technical, and competitive claims referenced in this PRD is maintained in `01-problem-and-failures.md` and `02-differentiation.md`. Additional sources specific to this document:

- Monad network performance specifications (block time, finality, TPS target) — Monad Labs / Category Labs technical documentation, 2025–2026
- Monad reserve balance mechanism — Monad developer documentation, "Parallel Execution" and account model sections
- Circle USDC on Monad, mainnet contract address and mint figures — Circle Internet Financial and Aave governance forum asset assessment, 2025–2026
- Twitch/Streamlabs monetized channel data — industry reporting cited in `01-problem-and-failures.md`
