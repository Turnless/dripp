# dripp — Frontend Design System

The single source of truth for how dripp looks, moves, and speaks. Read this
before building or changing anything in `app/`. It sits on top of — never
overrides — the non-negotiable rule in `CLAUDE.md`:

> **The blockchain is invisible.** No wallet addresses, token tickers, gas,
> seed phrases, or wallet-connect UI anywhere. Balances are dollars. The only
> disclosed "machinery" is our own fee — charged only on withdrawals (tips are
> free) and shown plainly before a withdrawal is confirmed.

Motion, materials, and typography follow the Apple design principles in
`.claude/skills/apple-design/SKILL.md` (installed in this repo).

---

## 1. Direction

**Clean fintech. Minimal. Glass.** dripp should feel like a calm, trustworthy
money app (Cash App / Revolut tier) — not a crypto dashboard, not a gamer
overlay. Money is the hero; everything else steps back.

- **Minimalism, not emptiness.** One primary action per screen. Every element
  earns its place (*Simplicity — not minimalism*, apple-design §16).
- **Glass as a functional layer.** Translucent surfaces float over a soft
  purple-tinted field to create hierarchy — nav, sheets, key cards. Content is never
  glass-on-glass.
- **Emotion to reinforce:** *calm confidence, premium feel.* Sending money should feel
  instant, certain, and a little delightful at the moment of success — never
  anxious. Motion is part of the product, not decoration added later (§6):
  every screen, list and control has considered, interruptible animation.

---

## 2. Color

Palette: **Monad purple** on soft off-white, with deep-purple ink. **Light
only — there is no dark mode.** All values live as tokens in
`app/globals.css`; changing the palette means editing that one file.

### 2.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--brand` | `#836EF9` | Monad purple. Glows, gradients, timeline line, highlights, focus ring |
| `--primary` | `#6D5AF0` | Deeper step of Monad purple for button fills and purple text |
| `--primary-hover` | `#5C48E4` | Hover on primary |
| `--deep` | `#200052` | Monad deep purple. Photo overlays, subtle borders, shadows |
| `--tint` | `#F1EEFF` | Icon wells, active tab pill, chips |
| `--bg` | `#F8F7FC` | Page background (with two soft purple glows) |
| `--surface-solid` | `#FFFFFF` | Solid surfaces, glass fallback |
| `--text` | `#110E24` | Primary text, big money amounts |
| `--text-muted` | `#625E7A` | Secondary text |
| `--text-emphasis` | `#6D5AF0` | Links, highlighted words, icons |
| `--positive` | `#0E8A44` | Money received, success |
| `--negative` | `#D93036` | Errors, failed sends |
| `--caution` | `#B46414` | Warnings |

Why two purples: white text on `#836EF9` is only ~3.8:1, below the 4.5:1
needed for button labels. `#6D5AF0` (~4.8:1) carries text; `#836EF9` carries
the brand everywhere text doesn't sit on it. Gradients (`.bg-brand-gradient`,
`.text-gradient`) blend primary → Monad purple → soft violet.

Rules:
- No raw hex values in components — Tailwind classes map to the tokens.
- Color lives on **solid** layers; glass carries neutrals only (apple-design §12).
- Big dollar amounts use `--text` (not primary) — money reads as fact, not decoration.
- Primary buttons carry a soft colored shadow (`shadow-primary`) for depth.
- Photos always sit under a `deep` gradient so white text on them stays readable.

---

## 3. Typography

**Typeface: DM Sans** (Google Fonts, variable, loaded via `next/font/google`).
Chosen as the openly-licensed stand-in for Cash App's proprietary *Cash Sans* —
same geometric, friendly-but-serious fintech feel. If a Cash Sans license is
obtained later, swap it in `app/layout.tsx` only; tokens below stay the same.

All numbers use **`font-variant-numeric: tabular-nums`** so balances and
amounts never jiggle as digits change.

| Style | Size (mobile → desktop) | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `display-money` | `clamp(3rem, 12vw, 5rem)` | 600 | 1.0 | `-0.035em` | Balance, amount entry |
| `title-1` | `1.75rem → 2.25rem` | 600 | 1.1 | `-0.02em` | Screen titles |
| `title-2` | `1.25rem → 1.5rem` | 600 | 1.2 | `-0.01em` | Section / card titles |
| `body` | `1rem` | 400 | 1.5 | `0` | Default text |
| `body-strong` | `1rem` | 500 | 1.5 | `0` | Row primary text |
| `caption` | `0.8125rem` | 500 | 1.4 | `+0.01em` | Timestamps, fee line, helper text |
| `label` | `0.75rem` | 600 | 1.3 | `+0.04em` | Uppercase micro-labels (sparingly) |

Rules (apple-design §15):
- Tracking tightens as size grows; never one letter-spacing for everything.
- Hierarchy from weight + size + leading together; emphasize with weight.
- Sizes and spacing in `rem` so the user's text-size setting scales the layout.
- Text on glass: one step heavier and slightly more tracking than on solid.

---

## 4. Glass & depth

### 4.1 Material levels

| Level | Blur | Background | Shadow | Used for |
|---|---|---|---|---|
| `glass-thin` | `12px` | `--surface-glass` | none | Chips, small pills, list rows on hover |
| `glass` | `20px` + `saturate(160%)` | `--surface-glass` | `0 8px 24px rgba(2,26,19,.18)` | Cards, bottom tab bar, sidebar |
| `glass-thick` | `32px` + `saturate(180%)` | `--surface-glass-strong` | `0 24px 60px rgba(2,26,19,.28)` | Sheets, modals, the send flow |

Every glass surface also gets a `1px` `--border-glass` border and a brighter
**top edge** (`--edge-highlight`) — light catching the material.

### 4.2 Rules
- **Glass needs something behind it.** The page background is a soft, static
  field: `--bg` plus two large blurred `--bg-glow` blobs (top-left, bottom-right).
  Never animated, never full-viewport motion.
- **Never stack glass on glass.** Inside a glass card, use solid or transparent
  rows — not another translucent layer.
- **Bigger = thicker.** Sheets are heavier than cards; cards heavier than chips.
- **Modal task → scrim + push back.** Blocking flows (send, confirm) dim the
  page (`rgba(2,26,19,.5)`) and scale it to `0.97`. Non-blocking panels use
  glass with no scrim.
- **Sticky header edge:** a blur/gradient fade where content scrolls under it —
  no hard 1px divider.
- **Accessibility fallbacks (required):**
  - `prefers-reduced-transparency: reduce` → glass becomes `--surface-solid`, no blur.
  - `prefers-contrast: more` → solid surfaces + `forest` 1.5px borders.
  - No `backdrop-filter` support → solid surfaces automatically.

---

## 5. Layout & spacing

- **Spacing scale (rem):** `0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4`. Nothing off-scale.
- **Radii:** `12px` inputs/chips · `20px` cards · `28px` sheets · full pill for primary buttons.
- **Touch targets:** min `44×44px`, with ~10px of hit padding around small icons.
- **Breakpoints:** `sm 640` · `md 768` · `lg 1024` · `xl 1280`.

### 5.1 Mobile (< 768px) — designed first
- Single column, `16px` side gutter, content max-width fills the screen.
- **Floating bottom tab bar** (`glass`, pill, safe-area aware) with a raised
  circular **Send** button in the middle and a sliding active pill.
  Viewers: **Money · Activity · [Send] · Profile**. Creators:
  **Money · Creator · [Send] · Activity · Profile**.
- Header: wordmark + avatar.
- Primary actions sit in the bottom third (thumb zone).
- Flows (send, add money, withdraw) open as **bottom sheets** that rise from the tab bar.

### 5.2 Desktop (≥ 1024px) — designed alongside, not stretched
- **Floating command bar** (`glass`, fixed, 16px from the top, max-width
  1040px, fully rounded): wordmark left; center segmented nav whose active
  pill **slides** between items (shared `layoutId` spring); right: primary
  Send button + avatar (→ Profile). No sidebar.
- Main column max-width `720px`, centered under the bar.
- Flows open as **centered glass-thick dialogs** (max-width `440px`) that scale
  from the triggering button.
- Keyboard: every flow fully operable by keyboard; `Esc` closes; visible focus rings.

### 5.3 Tablet (768–1023px)
Mobile layout with a wider content column (max `600px`) and the tab bar kept.

---

## 6. Motion

Library: **Motion** (`motion` npm package) for springs; CSS only for trivial
hover/press states. Animate only `transform` and `opacity` (plus blur on glass
enter/exit).

| Token | Spring | Use |
|---|---|---|
| `spring-default` | bounce `0`, duration `0.35` | Most UI: cards, dialogs, route content |
| `spring-sheet` | bounce `0.15`, duration `0.3` | Bottom sheets after a drag/flick |
| `spring-snappy` | bounce `0`, duration `0.2` | Tabs, toggles, segmented controls |
| `press` | CSS `scale(0.97)`, `100ms ease-out` | Every pressable, on pointer-**down** |

Rules (apple-design §§1–7, 14):
- Feedback on **pointer-down**, instantly. No artificial delays anywhere.
- Every animation is **interruptible**; never lock input during a transition.
- Bounce only when a gesture carried momentum (sheet flick). Menus/dialogs: no overshoot.
- **Enter and exit on the same path;** sheets/popovers originate from their trigger.
- Bottom sheets: drag-to-dismiss with 1:1 tracking, velocity handoff, rubber-band at the top.
- Glass surfaces **materialize** — blur + scale + opacity together, not a plain fade.
- `prefers-reduced-motion: reduce` → short opacity cross-fades only; no springs, no slides.

Shared primitives live in `components/motion.tsx`: `Reveal` (rise + unblur on
scroll into view), `Stagger`/`StaggerItem` (children appear in sequence),
`CountUp` (numbers count up), `WordsIn` (headline words rise in).

Where motion is required:
- **Page changes:** content rises and unblurs in (`app/(app)/template.tsx`).
- **Every screen's content:** staggered entry, never all-at-once.
- **Navigation:** the active pill slides between tabs; never a hard swap.
- **Cards:** lift ~4px on hover (desktop).
- **Landing:** headline words rise in; sections reveal on scroll; a live
  example alert feed; count-up stats; a drawn line connecting the steps.
- Overlays (sheets, dialogs) render through a portal to `<body>` so page
  transforms never trap them.

### 6.1 Signature moments (where delight is allowed)
- **Tip sent:** amount text scales down and lifts off as the success check draws in;
  a single soft haptic (`navigator.vibrate(10)` where supported).
- **Money received / claimed:** the balance counts up (tabular nums, ~600ms).
- **Overlay alert:** glass card slides up from the bottom edge, holds, exits the same way.

---

## 7. Voice & vocabulary

Plain, warm, short. Second person. Sentence case everywhere.

**Write like a person, not a product brochure.**
- Use normal, everyday English. If you wouldn't say it out loud to a friend, rewrite it.
- No generic AI/marketing words: *seamless, effortless, unlock, elevate, empower,
  leverage, revolutionize, next-level, cutting-edge, game-changer, supercharge,
  journey, delve, robust, harness, streamline, "in today's world"*. Say the
  concrete thing instead ("Tips arrive in about a second", not "Seamless instant payments").
- No emojis in UI copy. Status is shown with icons from the icon set (§8), not
  emoji characters. The only exception is content a user writes themselves (tip notes).
- No exclamation marks except on the one success moment ("Sent!" is fine; everything else is calm).

| Never say | Say instead |
|---|---|
| wallet, address, 0x… | *your balance*, *your account* |
| USDC, token, crypto, Monad, chain | *dollars*, *money* (or nothing) |
| gas, network fee | — (we sponsor it; never mention) |
| transaction, tx hash | *payment*, *receipt* (show a short receipt ID, never a hash) |
| confirm on-chain, pending block | *sending…*, *sent* |
| connect wallet | *sign in* |
| claim your tokens | *collect your tips* |
| escrow, pending deposit | *waiting for @name to join* |

**Fees:** tips are free — the recipient gets the full amount, and the send
review says so ("Fee: Free"). dripp's only fee is on **withdrawals**
(**1%**, `WITHDRAWAL_FEE_BPS` in `lib/fees.ts`), always shown as a
breakdown before confirming:
**"You withdraw $50.00 · dripp fee (1%) $0.50 · You receive $49.50."**

Error messages say what happened and what to do: *"That username doesn't
exist on YouTube. Check the spelling and try again."* — never raw codes.

---

## 8. Components

Build these once in `app/components/` (or `components/ui/`) and reuse them.

| Component | Notes |
|---|---|
| `AppShell` | Background field + glows, floating tab bar (mobile) / floating command bar (desktop), Send sheet |
| `GlassCard` | `glass` level; `padding` + `as` props; never nests another GlassCard |
| `Sheet` / `Dialog` | Responsive: bottom sheet on mobile, centered dialog on desktop; scrim, focus trap, drag-to-dismiss |
| `Button` | `primary` (purple fill, white text, pill, colored shadow), `secondary` (glass-thin), `ghost`, `destructive`; loading state keeps width |
| `MoneyDisplay` | Formats cents → `$1,234.56`; tabular nums; optional count-up |
| `AmountKeypad` | Large display-money entry + quick-pick chips ($1, $5, $10, $20); uses the phone's number keyboard (`inputMode="decimal"`), normal typing on desktop |
| `HandleInput` | Platform segmented control (YouTube / Kick) + `@handle` field; inline live validation via `/api/username/resolve` |
| `FeeBreakdown` | Withdraw amount / fee / you receive (§7) — mandatory before any withdrawal is confirmed |
| `ActivityRow` | Avatar/initial, name/@handle, direction, relative time, signed amount; states: settled / waiting to join / failed |
| `VerifiedBadge` | Small primary check seal; tooltip "Verified YouTube creator" |
| `PlatformChip` | YouTube / Kick glyph + label; "Coming soon" variant for reduced-feature platforms |
| `EmptyState` | Icon, one line, one action — never a dead end |
| `Skeleton` | Shimmer-free pulse on glass; matches final layout exactly |
| `Toast` | Status / completion / warning / error; glass-thin; auto-dismiss 4s; never used for errors that block a flow |

Icons: one consistent outline set (e.g. `lucide-react`, 1.75px stroke). No
crypto iconography (no coins-with-symbols, chains, wallets, cubes).

---

## 9. Screens

Priority: **P0** = required for the live demo · **P1** = strongly wanted for
judging · **P2** = PRD scope, after the core works. Build strictly in order.

### P0 — demo path

1. **Landing page** (`/`, signed out — `components/landing/Landing.tsx`)
   Floating nav that turns to glass on scroll (section links, Sign in, Get
   started). Hero: eyebrow chip, word-by-word headline, plain sentence, CTAs,
   and a **live example alert feed** (sample tips slide in, running total
   ticks up; labelled "Example"). Then, each revealed on scroll: count-up
   stats (~1s arrival, 0% on tips, 1% on withdrawal); **Features as a live
   timeline** — one line down the middle that fills with Monad purple as you
   scroll, feature cards popping in on alternating sides and attached to it by
   a connector, the node nearest the screen center pulsing (on phones the line
   runs down the left); How it works (3 steps joined by a drawn line); For
   viewers / For creators switch beside a photo; **Why dripp as tall photo
   cards** with a folder-tab top edge (SVG `clipPath`), big uppercase title,
   meta row and a round white button that slides the details up — fanned and
   overlapping on desktop, swipeable on phones; the fee model; FAQ; closing
   CTA; **footer**: wordmark + one-line description, link columns, a "Start
   tipping today" card, copyright and back-to-top. Feature cards use the
   `card-wash` purple-to-white gradient; nav bars use `liquid-glass` (clear,
   light 6px blur, bright rim, soft sheen) via `LiquidBar`
   (`components/ui/LiquidGlass.tsx`): on hover a highlight follows the pointer
   across the bar, and a glass "lens" pill (`useHoverLens`) glides between
   hovered links and fades when the pointer leaves. **FAQ**: two columns —
   sticky intro ("Questions, answered." + a "try it" card) and numbered
   `card-wash` question cards; one open at a time (first open by default), the
   open card gets a purple ring, glow and gradient number, and its plus
   rotates into a cross. Photos live in `public/images/`
   (Unsplash License; credits in `CREDITS.md`, not shown on the page).
   Every claim must be true of the product as designed; facts about other
   platforms must come from `docs/`.

2. **Setting up** (post-login, while `/api/me` runs)
   Centered wordmark + subtle pulse, copy "Setting up your account…". Error
   state with "Try again". Never shows wallet creation language.

2b. **How will you use dripp?** (once, right after setup — `ModePicker` in
   `components/AuthGate.tsx`) Two large selectable cards: *I'm a viewer* /
   *I'm a creator*. Saved as `users.mode` via `PATCH /api/me`; changeable in
   Profile. It only tailors the UI (creators get the Creator tab and a
   "Reward your viewers" card) — it is not a separate account type; everyone
   can send and receive tips (PRD 7.1).

3. **Money** (`/`, signed in — home)
   - `display-money` balance (counts up) on a glass-thick card; caption "Available".
   - Three actions: **Send** (primary) · **Add money** · **Withdraw**.
   - Creators: a "Reward your viewers" card linking to Creator.
   - "Recent" — last 5 ActivityRows, "See all" → Activity.

4. **Send flow** (Sheet/Dialog from Send) — 3 steps, one decision each:
   1. **Who** — HandleInput (platform + @handle). Live status under the field:
      "@name is on dripp" (check icon) · "@name hasn't joined yet. They'll get it when they do" · "Can't find that username".
   2. **How much** — AmountKeypad; shows remaining balance; "Add money" inline if short.
   3. **Review** — recipient, amount, "Fee: Free", "@name gets $5.00",
      optional note, primary "Send $5.00". Button shows progress in place.

5. **Sent** (final step of the sheet)
   Signature success moment (§6.1): "Sent to @creator" / "Waiting for
   @creator to join — we'll hold it for them". Actions: Done · Send again.

6. **Activity** (`/activity`)
   Grouped by day; filter chips All · Sent · Received · Waiting. Tapping a row
   opens a Receipt sheet (amount, fee, counterparty, time, receipt ID).

7. **Overlay** (`/overlay/[platform]/[username]` — OBS browser source)
   Transparent background, no chrome. Alert = glass-thick card, bottom-center:
   supporter name (or "Someone"), `display-money` amount, optional note. 6s
   hold. Must render crisply at 1920×1080 over any game footage — uses a
   stronger scrim-backed glass than the app.

### P1 — judging strength

8. **Collect your tips** (claim) — shown after a new user links a platform with
   waiting tips: "You have $40.00 from 8 supporters waiting" → primary "Collect".
   The single most important onboarding moment — make it feel great.
9. **Creator** (`/creator`) — Channel card (Link YouTube, Kick "coming soon";
   once linked: verified badge + handle), **Reward your viewers** (opens bulk
   send, screen 14), **Tip alerts on stream** (OBS link + animated Copy).
10. **Creator dashboard extras** (`/creator`, linked) — live sub count, tips
    this stream / week, top supporters.
11. **Public profile** (`/u/[handle]`) — name, avatar, badge, total received /
    tipped (if public), big "Tip @handle" button — the shareable link creators
    put in their stream description.
12. **Add money** (Sheet) — amount → provider handoff (Mercuryo widget) →
    "Money added" state. Only dollars on our side of the handoff.

### P2 — full PRD

13. **Withdraw** (Sheet from Money — `components/WithdrawSheet.tsx`) — amount →
    FeeBreakdown (the only fee) → confirm. Final button reads "Withdrawals open
    soon" until the offramp exists. Fallback path (external address) must
    still avoid crypto language where possible.
14. **Bulk send** (Sheet from Creator — `components/send/BulkSendSheet.tsx`) —
    platform + paste handles (become removable chips, max 50) → "Split a
    total" or "Same for each" with live per-person preview → review list →
    per-person live progress (sending / sent / held until they join / failed).
    Later: pick from recent supporters and the bot-filtered count
    ("3 accounts skipped — looked automated").
15. **Supporter insights** (`/creator/insights`) — real vs. suspicious
    supporters as a single stacked bar + counts. Neutral language
    ("likely real" / "looks automated"), never accusatory.
16. **Profile / settings** (`/profile`) — viewer/creator switch, sign out;
    later profile visibility. No theme setting (light only).

### Every screen must define
Loading (skeleton), empty (EmptyState with an action), error (what + what to
do), and offline states — and answer: *where am I, where can I go, how do I get
out* (apple-design §16, wayfinding).

---

## 10. Third-party UI we don't control

- **Privy modal:** `appearance.theme: "light"`, `accentColor` is the primary
  token value, Google is the only method. Embedded wallet UI
  prompts are **disabled** with `embeddedWallets.showWalletUIs: false`
  (checked against the installed `@privy-io/react-auth@1.99` types).
- **Mercuryo widget:** embed in a Sheet with our header; pass fiat amount;
  if it shows crypto terms we can't hide, note it as a known limitation.

---

## 11. Implementation notes

- **Tokens:** define all colors, radii, blur, and shadows as CSS custom
  properties in `app/globals.css` under `:root` (light only);
  expose them to Tailwind via `theme.extend` in `tailwind.config.ts`. No raw hex
  values in components.
- **Theme:** light only (`color-scheme: light`); no theme switching code.
- **Font:** `next/font/google` → `DM_Sans` with `variable: "--font-sans"`,
  `display: "swap"`.
- **New deps when UI work starts:** `motion` (springs), `lucide-react` (icons).
  Nothing else without a reason.
- **Money formatting:** one helper (`formatUsd(cents)`) via `Intl.NumberFormat`;
  amounts are handled as integer cents in the UI.
- **Checks:** `npx tsc --noEmit` after every UI change (CLAUDE.md), plus a manual
  pass at 375px and 1280px, with reduced motion and reduced
  transparency enabled.

---

## 12. Review checklist (before any UI change is "done")

- [ ] No crypto vocabulary or addresses anywhere (§7) — including toasts and errors.
- [ ] Plain English only: no generic AI/marketing words, no emojis in UI copy (§7).
- [ ] Tips say "Free"; the withdrawal fee breakdown is shown before any withdrawal.
- [ ] Every screen animates in (stagger/reveal) and every control has press feedback.
- [ ] Only brand/derived/functional colors from §2, via tokens.
- [ ] Readable with reduced transparency and high contrast.
- [ ] Mobile (375px) and desktop (1280px) layouts both intentional.
- [ ] Press feedback on pointer-down; animations interruptible; reduced motion respected.
- [ ] Loading, empty, and error states exist.
- [ ] Tabular numbers on every amount.
