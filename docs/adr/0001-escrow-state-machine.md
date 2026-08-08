# Escrow releases on buyer confirmation only; deadline is a duration from funding

The PRD's original draft and the frontend brief disagreed on the escrow lifecycle (the brief had "buyer and seller agree to complete" and a `cancelled` state). We settled on a buyer-confirm-only machine: `Funded → Delivered → Completed`, with `Refunded` as the sole alternative exit, available only after the delivery deadline and before completion. The seller's "agreement" is implicit in delivering; there is no mutual-cancel, no dispute flow, and no fee logic in the contract. The delivery deadline is computed at **funding** time (`fundedAt + deliveryWindow`), not fixed at listing time — an absolute listing deadline could expire before any buyer exists.

## Considered options

- **Mutual agreement to release** (frontend brief): adds a seller signature step with no trust benefit — the seller already signaled by delivering — and doubles the release-path states to test.
- **Refund only from `Funded`** (seller-favored): once delivered, funds would be locked until the buyer confirms, so a silent buyer griefs the seller forever.
- **Chosen: refund allowed from `Funded` or `Delivered` after expiry** (buyer-favored, per the PRD's "refunds possible only after expiry and before completion"): matches the rekber norm that escrow primarily protects the buyer.

## Consequences

A buyer can receive the product and still reclaim funds after the deadline by never confirming. This is accepted for the MVP: windows are short, the delivery hash is on-chain evidence, and reputation/arbitration are the documented V2 mitigations. Do not "fix" this by locking funds at `Delivered` — that reintroduces the seller-griefing variant, which we judged worse.
