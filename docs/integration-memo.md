# Frontend integration memo — read this before building more escrow UI

For: frontend teammate. From: backend (contract + chain integration).
**TL;DR: three things in your prompt changed. The interface file you should build your mock against is [`shared/escrow.ts`](../shared/escrow.ts).**

## 1. The state machine changed — some states in your brief don't exist

Your brief listed escrow steps including "buyer **and seller agree** to complete" and states `pending / completed / cancelled / failed`. The contract works differently:

| Your brief said | What actually exists |
|---|---|
| Purchase initiated | Frontend-only `pending` (tx in flight) — fine, keep it |
| Funds transferred to escrow | **`Funded`** (on-chain state; first state of every trade) |
| Buyer and seller agree to complete | **Does not exist.** Replaced by two one-sided actions: seller submits delivery → **`Delivered`**, then buyer confirms receipt → **`Completed`** |
| Payment released to seller | That *is* `Completed` — same moment, not a separate state |
| Cancelled | **Does not exist.** No mutual cancel. The only other exit is **`Refunded`**: buyer reclaims funds after the delivery deadline passes |
| Failed | Frontend-only rendering of a reverted tx — fine, keep it |

Canonical machine: `Funded → Delivered → Completed`, or `Funded/Delivered → Refunded` (only after deadline). Terminal states: `Completed`, `Refunded`.

UI this implies:
- Buyer sees a **Confirm Receipt** button when status is `Delivered` (this releases payment and unlocks nothing further — download already unlocked at `Delivered`).
- Buyer sees a **Reclaim Funds** button when `now > deadline` and status is not `Completed`.
- No cancel button anywhere.

## 2. Zone names changed — not real oceans

Not Pacific/Atlantic. The world map has exactly two zones:

| `zoneId` | Name | Vibe |
|---|---|---|
| 0 | **Coral Capital** | sunlit shallow reef, hub |
| 1 | **Sardine Harbor** | bustling merchant port, main market |

(Shipwreck Cove is cut from the MVP.)

## 3. Build against `shared/escrow.ts`

Your mock should implement the `EscrowService` interface in that file, and the game should only ever talk to escrow through it. At integration time we swap in the real implementation (viem + deployed contract) behind the same interface — no UI changes.

Notes:
- `markDelivered` is in the interface so your mock can simulate the seller: wire it to a hidden dev-panel button that advances a trade to `Delivered`. In the live demo the real seller acts via script.
- Buying is **two explicit steps** (`approveUsdc` then `fundTrade`) — render them as two steps ("Approve $5.00" → "Deposit to escrow"), each will be a real wallet popup later.
- Gate irreversible UI moments (download unlock, "seller paid!") on `tx.wait()`, not on submission. On Monad that resolves in under a second — which is part of the pitch.
- Prices are `bigint` 6-decimal USDC base units; use `formatUsdc()` from the same file.

## Seed listings (your mock data should mirror these)

| id | Zone | Name | Price | Delivery window |
|---|---|---|---|---|
| 1 | Sardine Harbor | Pixel Reef Starter Pack (the game's own sprite pack) | $5.00 | 24 h |
| 2 | Sardine Harbor | Ghost Ship Map Pack | $3.00 | **60 s** (this one demos the refund live) |
| 3 | Coral Capital | Captain's Hat Template | $2.00 | 24 h |

Listing metadata (names, descriptions, art, stall positions) lives in your `listings.json`, keyed by these ids — the chain only stores price/hash/window.

## What you'll get from backend, and when

Exactly three files, hand-delivered on every change (no repo-watching):
1. `shared/escrow.ts` — now (this is the canonical copy)
2. `DigitalEscrow.abi.json` — when the contract compiles (~hour 1)
3. `deployments.json` — contract + MockUSDC addresses on Monad testnet (~hour 2)

Demo product: the Starter Pack download is a zip of the game's own fish sprites — when you have sprite assets, send the zip so its hash can go on-chain.

## How to swap mock → real (the #6 one-liner)

When you're ready to connect to the live contract, replace wherever you construct your mock service with:

```ts
// Before (mock):
import { createMockEscrowService } from './escrow.mock';
const escrow = createMockEscrowService();

// After (real — this is the entire swap):
import { createChainEscrowService } from '../../shared/escrow.real';
import deployments from '../../shared/deployments.json';
const escrow = createChainEscrowService(deployments);
```

`deployments.json` has the live contract addresses, chain ID (10143), and RPC URL already baked in. No other UI changes needed — both implementations satisfy the same `EscrowService` interface.

One heads-up: your `listings.json` should handle unknown listing IDs gracefully (e.g. `listing ?? null`). The `create-listing.sh` script may add a live listing during the demo, so the on-chain count could exceed your static file.
