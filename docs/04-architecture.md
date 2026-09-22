# System Architecture

**Project name:** dripp
**Chain:** Monad (mainnet) · **Asset:** native USDC

---

## 1. High-level overview

```mermaid
flowchart TD
    A[Client<br/>Web app & OBS overlay]
    B[Application - Next.js<br/>Frontend + API routes]
    C[Core services<br/>Wallet, onramp, platform data]
    D[Monad + database<br/>USDC settlement & storage]

    A --> B --> C --> D
```

Four layers, top to bottom: the surfaces a user actually sees, the single application hub everything routes through, the three external services that hub calls, and the settlement/storage layer underneath.

## 2. Detailed component view

```mermaid
flowchart TD
    subgraph Client
        WebApp[Web app]
        Overlay[OBS overlay]
    end

    subgraph Application[Application - Next.js]
        API[API routes]
        Watcher[Event watcher]
    end

    subgraph Services[Core services]
        Privy[Privy - embedded wallet]
        ZeroDev[ZeroDev - gas sponsorship]
        Mercuryo[Mercuryo - onramp/offramp]
        PlatformAPI[YouTube/Kick API]
    end

    subgraph Settlement[Monad + database]
        Contract[TipVault contract]
        USDC[Native USDC]
        DB[(Supabase/Postgres)]
    end

    WebApp --> API
    API --> Watcher
    Watcher --> Overlay

    API --> Privy
    API --> ZeroDev
    API --> Mercuryo
    API --> PlatformAPI

    ZeroDev --> Contract
    Mercuryo --> USDC
    Contract --> USDC
    API --> DB
```

This is the same four layers, broken into the actual pieces referenced throughout the flows below.

---

## 3. Layer descriptions

### Client
- **Web app** — the main product surface: sign-up, wallet balance, tip/withdraw, history, and the Creator Mode dashboard.
- **OBS overlay** — a separate, lightweight page (e.g. `/overlay/[username]`) added as a browser source in OBS. No navigation, no buttons — it only listens for events and renders tip alerts.

### Application (Next.js)
The single hub everything routes through. The client never calls Privy, Mercuryo, or the platform APIs directly — only the Application layer does. Responsibilities: auth sessions (Google + platform OAuth), the tip-send endpoint, the event watcher (polls/subscribes to Monad, pushes to the overlay), and username resolution (own database first, one live platform API call only when needed).

### Core services
- **Wallet + gas (Privy + ZeroDev)** — creates the embedded wallet at sign-up and wraps it as a smart account capable of sponsored (gasless) transactions.
- **Onramp/offramp (Mercuryo)** — converts card/Apple Pay deposits into USDC on Monad, and reverses that for withdrawals.
- **Platform data (YouTube/Kick APIs)** — OAuth verification for Creator Mode, live sub counts, and single-username lookups for the tip-before-signup flow.

### Monad + database
- **Monad** — the settlement layer: the `TipVault` contract and native USDC transfers.
- **Database (Supabase/Postgres)** — everything off-chain: user records, platform-username-to-wallet mappings, pending tips, cached bot/real scores, and history for fast display.

---

## 4. Key flows

### 4.1 Sign-up

```mermaid
sequenceDiagram
    participant U as User
    participant App as Application
    participant Privy
    participant ZeroDev
    participant DB as Database

    U->>App: Sign up with Google
    App->>Privy: Create embedded wallet
    Privy-->>App: Wallet address
    App->>ZeroDev: Wrap as smart account
    ZeroDev-->>App: Smart account ready
    App->>DB: Store user + wallet mapping
    App-->>U: Dashboard ($0 balance)
```

### 4.2 Deposit (onramp)

```mermaid
sequenceDiagram
    participant U as User
    participant App as Application
    participant Mercuryo
    participant Monad

    U->>App: Add Money ($20, card/Apple Pay)
    App->>Mercuryo: Initiate onramp
    Mercuryo->>Monad: Deposit USDC to user wallet
    Monad-->>App: Balance updated (event watcher)
    App-->>U: Dashboard shows $20
```

### 4.3 Tip a signed-up user

```mermaid
sequenceDiagram
    participant U as Viewer
    participant App as Application
    participant DB as Database
    participant ZeroDev
    participant Monad
    participant Overlay

    U->>App: Tip @creator $5
    App->>DB: Look up @creator
    DB-->>App: Wallet found
    App->>ZeroDev: Build sponsored transaction
    ZeroDev->>Monad: Submit transaction
    Monad-->>App: Confirmed (under 1s)
    App->>DB: Log tip in history
    App->>Overlay: Push live alert (SSE)
```

### 4.4 Tip an unclaimed username, then claim

```mermaid
sequenceDiagram
    participant U as Viewer
    participant App as Application
    participant DB as Database
    participant PlatformAPI as YouTube/Kick API
    participant Creator

    U->>App: Tip @newcreator $5
    App->>DB: Look up @newcreator
    DB-->>App: Not found
    App->>PlatformAPI: Verify handle exists
    PlatformAPI-->>App: Handle confirmed
    App->>DB: Store pending tip

    Note over Creator,App: Later, creator discovers the tip
    Creator->>App: Sign up + link platform account
    App->>PlatformAPI: Verify OAuth ownership
    PlatformAPI-->>App: Verified
    App->>DB: Check pending tips for this handle
    DB-->>App: $5 pending
    App-->>Creator: Release funds to new wallet
```

### 4.5 Bulk / rule-based send

```mermaid
sequenceDiagram
    participant S as Streamer
    participant App as Application
    participant PlatformAPI
    participant ZeroDev
    participant Monad

    S->>App: "$50 split across tonight's subs"
    App->>PlatformAPI: Pull subscriber list
    PlatformAPI-->>App: List of usernames
    App->>App: Calculate per-person split
    loop each recipient
        App->>ZeroDev: Sponsored send (sub-wallet pool)
        ZeroDev->>Monad: Submit transaction
    end
    Monad-->>App: All confirmed
    App-->>S: Bulk send complete
```

### 4.6 Withdraw (offramp)

```mermaid
sequenceDiagram
    participant U as User
    participant App as Application
    participant Mercuryo
    participant Monad

    U->>App: Withdraw $15
    App->>Mercuryo: Initiate offramp
    Mercuryo->>Monad: Read USDC balance
    Monad-->>Mercuryo: Confirmed
    Mercuryo-->>U: Cash sent to card/bank
```

---

## 5. Pending tip lifecycle

```mermaid
stateDiagram-v2
    [*] --> Sent
    Sent --> Settled: recipient already exists
    Sent --> Pending: recipient not signed up yet
    Pending --> Claimed: recipient verifies via OAuth
    Claimed --> Settled
    Settled --> [*]
```

---

## 6. Database schema

```mermaid
erDiagram
    USERS ||--o{ TIPS : sends
    USERS ||--o{ TIPS : receives
    USERS ||--o{ PLATFORM_LINKS : has
    USERS ||--o{ PENDING_TIPS : "sends (escrow)"
    USERS ||--o{ PENDING_TIPS : claims
    USERS ||--o{ WITHDRAWALS : makes
    USERS ||--o| BOT_SCORES : has

    USERS {
        uuid id PK
        string privy_id
        string google_id
        string wallet_address
        string mode
        timestamp created_at
    }
    PLATFORM_LINKS {
        uuid user_id FK
        string platform
        string platform_username
        timestamp verified_at
    }
    PENDING_TIPS {
        uuid id PK
        string platform
        string platform_username
        decimal amount
        uuid sender_id FK
        string sender_wallet
        string deposit_tx_hash
        uuid claimed_by FK
        string claim_tx_hash
        timestamp claimed_at
        timestamp created_at
    }
    WITHDRAWALS {
        uuid id PK
        uuid user_id FK
        decimal amount
        decimal fee
        string tx_hash
        timestamp created_at
    }
    TIPS {
        uuid sender_id FK
        uuid recipient_id FK
        decimal amount
        string tx_hash
        timestamp created_at
    }
    BOT_SCORES {
        uuid user_id FK
        float score
        timestamp last_calculated_at
    }
```

---

## 7. Smart contract surface (kept intentionally thin)

A single `TipVault` contract handles:
- Direct transfers (a thin wrapper, mostly for onchain traceability)
- Holding pending tips for unclaimed usernames until a claim transaction — triggered by the backend once OAuth verification succeeds — releases them

Everything else (bulk-send batching, bot scoring, history) stays off-chain in the database, since none of it needs to be trustless to work for a hackathon submission — only the actual movement of money needs to be onchain.

---

## 8. Reference tech stack

| Layer | Tool |
|---|---|
| Login + wallet | Privy |
| Gas sponsorship / smart account | ZeroDev |
| Chain library | viem (+ wagmi in React) |
| Contracts | Solidity + Foundry |
| Payment rail | Monad MPP SDK / x402 facilitator |
| Onramp/offramp | Mercuryo |
| Frontend | Next.js + Tailwind |
| Overlay real-time | Server-Sent Events (or Pusher/Ably) |
| Backend | Next.js API routes |
| Database | Supabase (Postgres) |
| OAuth | NextAuth.js / Auth.js |
| Platform data | YouTube Data API (`forHandle`), Kick public API |
| Hosting | Vercel + Supabase |
