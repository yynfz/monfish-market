# MonFish-Market

An ocean-themed escrow marketplace for digital goods on Monad: buyer and seller fish meet in reef markets, fund USDC escrow on-chain, and release payment after delivery is confirmed. This context covers the escrow domain shared by the smart contract, the escrow service boundary, and the game frontend.

## Language

### Marketplace

**Listing**:
A seller's on-chain offer of a digital product: product hash, price, and delivery window, anchored in the escrow contract. Its human-readable metadata (name, description, art) lives offchain in the frontend, keyed by listing ID.
_Avoid_: Product, item, offer, stall (a Stall is the in-game rendering of a Listing's seller, not the offer itself)

**Trade**:
A single buyer-seller escrow instance, created the moment a buyer funds a listing. One listing can spawn many trades.
_Avoid_: Transaction (that means an on-chain tx), order, purchase

**Zone**:
A named ocean region on the world map where stalls live, identified on-chain by a zone ID. MVP zones: Coral Capital (0), Sardine Harbor (1).
_Avoid_: Ocean names like "Pacific Ocean" / "Atlantic Ocean" (dropped in favor of PRD names), region, map node

**Stall**:
The in-game coral shop where a seller fish displays their listings inside a zone. Purely a frontend/presentation concept.

### Escrow lifecycle

**Funded**:
Trade state after the buyer deposits USDC into escrow. First state of every trade — a trade does not exist before funding.

**Delivered**:
Trade state after the seller submits a delivery hash. Delivery is the seller's only lifecycle action; there is no separate seller "agreement" to release funds.

**Completed**:
Terminal trade state after the buyer confirms receipt; escrowed funds are released to the seller. Only the buyer can trigger it.

**Refunded**:
Terminal trade state after the buyer reclaims escrow because the delivery deadline passed without confirmation. The only exit besides Completed — there is no mutual-cancel and no dispute in the MVP.

**Delivery Window**:
A duration (seconds) set on the listing. The concrete deadline is computed at funding time (funded-at + window), never at listing time.
_Avoid_: Deadline as a listing-time absolute timestamp

**Delivery Hash**:
The keccak hash of the delivered artifact (license key or file) that the seller commits on-chain when marking a trade Delivered. Proves *what* was delivered, not that it is acceptable — acceptance is the buyer's confirmation.
_Avoid_: Delivery proof (overpromises; the contract cannot verify delivery quality)

**Pending / Failed**:
Frontend-only presentation states for an in-flight or reverted on-chain transaction. Never contract states.
_Avoid_: Cancelled (no such state exists anywhere in the system)

### Money

**MockUSDC**:
The project-deployed 6-decimal ERC-20 with an open mint, clearly labeled as fake, used because Monad testnet has no documented official USDC. The only token the escrow contract accepts.
_Avoid_: USDC (unqualified) when referring to the testnet token

**Escrow**:
USDC held by the escrow contract itself between Funded and Completed/Refunded. Never held by the platform or the seller.

### Integration

**Escrow Service**:
The TypeScript interface that is the sole boundary between the game frontend and the blockchain. The frontend teammate codes against a mock implementation; the real implementation (viem + deployed contract) swaps in behind the same interface.
_Avoid_: SDK, adapter, bridge

**Buyer** / **Seller**:
The two wallet-bearing roles in a trade. In the demo the buyer acts through the browser wallet in the game UI; the seller acts through Foundry scripts.
_Avoid_: Player (ambiguous — the frontend's "player" is always the buyer), merchant, customer
