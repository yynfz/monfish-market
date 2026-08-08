# Frozen mock frontend handoff

Issue #13 freezes the presentation build on the canonical `EscrowService` seam. The Vite application constructs `createMockEscrowService()` in `src/App.tsx`; issue #6 can replace that construction with `createChainEscrowService(deployments)` without redesigning the Marketplace, Listing drawer, or Trade controls.

## Deterministic artifacts

These files are served unchanged from the application root because Vite uses `assets/` as its public directory. The hashes are keccak256 over the exact file bytes.

| Listing | Served file | Keccak256 |
|---|---|---|
| Pixel Reef Starter Pack (#1) | `/pixel-reef-starter-pack.zip` | `0xed8bb25b2ddf4f5aeb11915ab115717e6038b34a316f389d1c3862d21159671e` |
| Ghost Ship Map Pack (#2) | `/ghost-ship-map-pack.zip` | `0x4c6979190de330bc50f9cf75cd76e502d6ccdf184d1fc3072da5b51a36688642` |
| Captain's Hat Template (#3) | `/captains-hat-template.zip` | `0x27128c2665ca52e0994bd4dc0b2e9b5a05817f72beaaa918ead9cbeea31714cf` |

The same values are recorded in `src/listings.ts`, `shared/catalog.ts`, the deployment seed, and Seller delivery tooling. `src/listings.test.ts` independently hashes all three source files on every test run.

## Verification and known limitations

Run `npm test`, `npm run typecheck`, and `npm run build`. The rendered suite covers browsing and equivalent interaction paths, focus containment/restoration, Pixel Reef completion, and Ghost Ship expiry/refund. Demo Mode persists its authoritative mock Trade snapshot in browser storage so refresh recovery does not infer chain state from presentation state; Reset Demo clears that snapshot. Live RPC, contract deployment, Seller scripts, testnet rehearsal, and wallet/network integration remain owned by issue #6 and are intentionally excluded from this freeze.
