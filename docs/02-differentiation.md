# What's Genuinely Different

*Project name: TBD — referred to below as "the platform."*

This document maps each root cause of failure identified in `01-problem-and-failures.md` against a specific, deliberate design decision made for this platform. The goal is not to claim novelty for novelty's sake — it's to show that each historical failure mode has a named, direct answer here, not a vague "we'll do it better."

---

## 1. Side-by-side: root cause of failure → this platform's answer

| Root cause of failure | Who it killed | This platform's answer |
|---|---|---|
| Middleman can't fund itself on micro-tip volume | ChangeTip, TipJar | Free tips plus a small, transparent fee when money is withdrawn (shown before the withdrawal is confirmed) **plus** referral revenue from the onramp/offramp provider — two disclosed, real revenue lines from day one, not "figure it out later" |
| New-wallet friction caps the audience | All crypto tipping attempts | Embedded wallet created invisibly at Google sign-up (no seed phrase, no wallet address ever shown); gasless sends via a sponsored-gas paymaster |
| Printed token creates a farming incentive | Farcaster $DEGEN / Farther | Tips move **real USDC**, not a project-printed token — there is nothing to print, inflate, or farm for free |
| Tiny real value behind big usage numbers | Noice ($0.05 avg tip) | No token-allowance giveaway mechanic to inflate tip counts artificially; usage numbers reflect real dollar transfers only |
| No EVM chain fast/cheap enough | StreamQubic (left EVM for Qubic), Flowmoji (bolted on off-chain state channels) | Built on **Monad** — an EVM-equivalent L1 with ~800ms finality and sub-cent fees, so a tip is just an ordinary onchain transaction, no non-EVM detour and no off-chain channel machinery required |
| No defense against reward-farming | Farcaster $DEGEN / Farther | (Originally scoped as a sybil-gated quadratic-funding layer; **descoped for the hackathon build** — see Non-Goals in the PRD. The underlying insight — that any reward mechanic needs sybil-resistance built in from day one, not bolted on after farmers arrive — still informs the bot/real breakdown feature kept in scope.) |
| One-directional, streamer-only tooling | Every prior attempt reviewed | A single shared account type: any user can tip or be tipped, in either direction — a streamer rewarding viewers uses the exact same rails as a viewer tipping a streamer |
| Can't receive money before joining the platform | Every prior attempt reviewed | Tip-by-platform-username: a creator can be tipped before they've ever heard of the platform, with funds held and automatically released the moment they sign in and prove ownership of that username via OAuth |

---

## 2. Comparison against the two closest live/attempted projects

| | StreamQubic | Flowmoji | This platform |
|---|---|---|---|
| Chain | Qubic (non-EVM) | Ethereum Sepolia + Yellow state channels | Monad (EVM-equivalent L1) |
| Why that chain | EVM chains weren't fast/cheap enough | Needed to avoid Ethereum gas fees, so routed around it | Monad's own execution layer is fast/cheap enough that no workaround is needed |
| Wallet UX | Requires a Qubic wallet (EasyConnect) | Requires a connected EVM wallet (Wagmi/RainbowKit) | Invisible embedded wallet via Google login — no wallet UI shown to the end user |
| Gas handling | Not applicable (non-EVM) | Avoided via off-chain channels | Sponsored via paymaster — real onchain transactions, gas invisible to the user |
| Asset tipped | Qubic's native asset | USDC via a payment channel | Native USDC on Monad, issued directly by Circle |
| Platform coverage claimed | Twitch, YouTube, "live streaming platforms" (general) | Twitch (working); YouTube explicitly "coming next" | One platform fully wired at launch (scope decision, see PRD), designed to extend to others |
| Receive money pre-signup | Not described | Not described | Yes — tip-by-username with claim-on-signup |
| Streamer → viewer flow | Not described | Not described | Yes — same infrastructure, bidirectional |
| Evidence of real (non-hackathon) usage | None found | None found | N/A — not yet built; explicitly targeting real user testing before submission (see PRD traction plan) |
| Status | Hackathon submission, Vercel demo | Hackathon submission, Sepolia testnet only | In development |

---

## 3. Comparison against TipStream (the closest existing Monad-native project)

TipStream is an existing Monad-based social tipping platform using MetaMask Smart Accounts for gasless, delegation-based auto-tipping. It validates two of this platform's core technical choices independently — embedded/smart-account wallets and gas sponsorship on Monad both already work in production elsewhere. The differentiation from TipStream specifically is scope: TipStream is a general social tipping product, not built around live-stream overlays, cross-platform identity verification, bidirectional streamer↔viewer flows, or the claim-before-signup mechanic.

---

## 4. What is *not* claimed as novel

In the interest of accuracy for a judged submission, it's worth being explicit about what parts of this platform are **assembly of existing, proven components** rather than new invention:

- Embedded/social-login wallets — an established pattern (Privy and similar providers), not invented here.
- Gas sponsorship / paymasters — a standard account-abstraction pattern, and Monad's own official x402 facilitator already bundles exactly this.
- Onramp/offramp via card or Apple Pay — provided by existing vendors (e.g., Mercuryo, which already supports Apple Pay deposits directly into Monad wallets).
- "Send money to someone who hasn't signed up yet, they claim it later" — the same pattern Cash App and Venmo already use for phone-number-based transfers.

The genuine originality of this platform is in the **combination and sequencing** of these pieces around a specific failure history — using real USDC instead of a printed token, making the chain itself (not a workaround) solve the speed problem, and building bidirectional tipping with pre-signup claiming into one shared account model — not in inventing any single piece from scratch.

---

## References

See `01-problem-and-failures.md` for full source list on prior-platform failures. Additional sources specific to this document:

- TipStream project description — Monad ecosystem project listings, 2026
- Monad x402 Facilitator specification — Monad developer documentation (x402-facilitator.molandak.org)
- Mercuryo Apple Pay onramp to Monad — Mercuryo/Monad ecosystem announcement, 2026
- Circle USDC on Monad — Circle Internet Financial blog, "Now Available: USDC, CCTP, Wallets, and Contracts on Monad," November 24, 2025 (https://www.circle.com/blog/now-available-usdc-cctp-wallets-and-contracts-on-monad)
