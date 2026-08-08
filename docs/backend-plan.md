# Backend implementation plan — 4-hour budget (+30 min reserve)

Scope settled in the grilling session (see `CONTEXT.md` for vocabulary, `docs/adr/0001` for the state-machine decision, `docs/integration-memo.md` for the frontend handoff).

**Owns:** `DigitalEscrow.sol`, `MockUSDC.sol`, Foundry tests, deploy/seed scripts, the real `EscrowService` implementation (viem), seller demo scripts.
**Does not own:** any UI, any server, any indexer.

## Wallets

| Role | Address | Funding |
|---|---|---|
| Buyer (browser, MetaMask) | `0x1d4881AB10CF94269D27a218565fd4c363BCB39a` | already holds 50 MON — keep ≥ 20 |
| Seller + deployer (script key) | generate with `cast wallet new`, key in `.env` | send 15 MON from buyer wallet, first thing |

Monad rules that bite demos: wallets under 10 MON are throttled (1 tx/~1.2 s) and can hit the reserve-balance revert — keep both comfortably above 10. A freshly funded wallet can't transact for ~1.2 s (3-block delayed state view) — fund the seller key well before deploying.

## Schedule (T+0 = now)

### T+0:00 – 0:10 — Unblock others first
- Send teammate `docs/integration-memo.md` + `shared/escrow.ts`. **Do this before any Solidity.**
- `cast wallet new` → seller/deployer key into `contracts/.env`; send 15 MON from MetaMask.

### T+0:10 – 0:40 — Scaffold
- `forge init contracts`, add OpenZeppelin.
- `MockUSDC.sol`: ERC-20, name "Mock USDC (Testnet)", 6 decimals, open `mint(address,uint256)`.
- `DigitalEscrow.sol` skeleton: structs, storage, events, constructor(`IERC20 usdc`).

### T+0:40 – 1:40 — Contract complete, tests green
Functions (frozen in grilling — do not grow):
```
createListing(uint8 zoneId, bytes32 productHash, uint256 price, uint64 deliveryWindow) → listingId
fundTrade(uint256 listingId) → tradeId        // transferFrom buyer; deadline = now + window
markDelivered(uint256 tradeId, bytes32 deliveryHash)
confirmReceipt(uint256 tradeId)               // pays seller; terminal
refundExpired(uint256 tradeId)                // pays buyer back; terminal
```
Rules: SafeERC20 + ReentrancyGuard; ids start at 1; listings reusable (each fund = new trade); `require(buyer != seller)`; only-buyer on confirm/refund, only-seller on deliver; refund requires `now > deadline && status != Completed` (allowed from `Funded` *or* `Delivered` — see ADR-0001); deliver requires `status == Funded` (late delivery allowed until refund lands; tx ordering resolves the race). No fee, no disputes, no cancel, no zone validation.
Events, all with indexed `tradeId` (+ `listingId`/`buyer`/`seller` where relevant): `ListingCreated`, `TradeFunded`, `TradeDelivered`, `TradeCompleted`, `TradeRefunded`.

Definition-of-done tests (~10): happy path with balance asserts; refund path via `vm.warp`; refund before expiry reverts; confirm twice / refund-after-confirm / confirm-after-refund revert; non-buyer confirm and non-seller deliver revert; fund without approval reverts; self-buy reverts.

→ **Handoff #2: `DigitalEscrow.abi.json`** to teammate.

### T+1:40 – 2:10 — Deploy + seed (do this early, not last)
Forge script, one run:
1. Deploy MockUSDC + DigitalEscrow(usdc).
2. Mint 1,000 USDC to buyer, 100 to seller.
3. Create the 3 seed listings as seller (ids 1–3; hashes = keccak of the sprite zip / placeholder files).
4. Write `deployments.json` (chainId 10143, RPC `https://testnet-rpc.monad.xyz`, both addresses, seed listing ids).
5. Sanity: `cast call` listings, check on `testnet.monadscan.com`.

→ **Handoff #3: `deployments.json`** to teammate.

### T+2:10 – 3:10 — Real EscrowService + seller scripts
- `shared/escrow.real.ts`: implements `EscrowService` with viem — reads via public getters, writes via wagmi injected wallet, `onTradeEvent` via `watchContractEvent` (polling transport on public RPC), `wait()` polls receipt at `finalized`.
- **Gas guardrails (Monad charges on gas *limit*, not gas used):** before opening any wallet popup, `simulateContract`; if it reverts, surface the reason in-UI and never reach the wallet (a reverting tx with MetaMask's fallback limit costs real MON). Set explicit gas limits = estimate + 10%.
- Seller scripts: `deliver.sh <tradeId> <file>` (hash + `markDelivered` via cast/forge script), `create-listing.sh` spare.

### T+3:10 – 3:40 — Integration
- Swap teammate's mock → real implementation (should be an import change).
- Two-tab run: MetaMask buyer buys Starter Pack (approve → fund popups), `deliver.sh`, confirm receipt, seller USDC balance up, explorer links live.

### T+3:40 – 4:00 — Rehearsal + fallback
- Full happy path twice; refund path once (fund Ghost Ship, wait 60 s narrating trust model, reclaim).
- Record a fallback screen capture of one clean run.

### Reserve (last 30 min)
Untouched. If reached with a working happy path, stop adding; polish narration.

## Cut lines
- **T+2:30, EscrowService slipping:** drop `getMyTrades` + event feed; UI polls `getTrade` on the active trade only. The bottle-feed is garnish.
- **T+3:10, integration failing:** demo the contract via scripts + explorer alongside the mocked frontend; narrate "wired after the deadline." Contract truth beats UI polish for judging.
- **T+3:40, refund path flaky:** cut it from live demo; show the Foundry refund test instead.

## Demo script deltas vs PRD
Buyer = real MetaMask popups (part of the pitch: "approves exactly $5.00"). Seller = terminal running `deliver.sh` — frame it as "the seller's backend." Refund beat happens in Sardine Harbor via the 60-second Ghost Ship listing (Shipwreck Cove cut). Gate the "Settled in under a second" line on `finalized` — it genuinely is.
