# Idea 12 - "MonFish-Market": Social Escrow Marketplace for Digital Goods

> **Swim the seven reefs. Trade through trust.**

**Track:** `GameFi` + `x402` + `DeFi`

## Pitch

MonFish-Market is an ocean-themed digital marketplace inspired by Ragnarok Online's global world map, rendered in a chunky Roblox-style look, where every character — buyer and seller alike — is a fish. Players swim across a nautical world map of reefs, ports, and shipwrecks, and sellers operate coral stalls in themed ocean zones listing digital products such as game assets, artwork, templates, software keys, or downloadable content.

When a buyer fish approaches a seller's stall, they can initiate a trade. The buyer deposits USDC into an onchain escrow contract. The seller delivers the digital product and submits a delivery proof. After the buyer confirms receipt, the smart contract releases the escrowed stablecoins to the seller.

It combines the familiar Indonesian `rekber` concept, or rekening bersama escrow, with a global-map ocean adventure experience and instant onchain settlement.

## Problem

Digital products are commonly sold through DMs, Discord, Telegram, or informal marketplaces. This creates several problems:

- Buyers worry that a seller will take payment without delivering.
- Sellers worry that buyers will receive the product and reverse the payment.
- Platforms often require accounts, payment processors, and high fees.
- Normal marketplaces reduce a social transaction to a form and a checkout button.

MonFish-Market makes the transaction visible and social while giving both parties a transparent settlement process.

## How It Works

### 1. Seller Opens a Stall

The seller connects a Monad wallet and creates a coral stall in one of the map zones. A listing contains:

- Product name
- Price in USDC
- Product description
- Product or listing hash
- Delivery deadline
- Seller wallet address
- Home reef on the ocean world map

The listing metadata can remain offchain while its hash is anchored in the contract.

### 2. Buyer Meets the Seller

The buyer opens the ocean map, swims to the zone where the stall sits, glides up to the stall, and interacts with the seller fish. The buyer can inspect the listing and start a trade without leaving the game world.

### 3. Buyer Funds Escrow

The buyer clicks `Buy`, reviews the stablecoin amount and deadline, approves the escrow contract to spend the required USDC, and funds the trade. The contract records the buyer, seller, payment token, amount, and trade deadline. MON is used only to pay network gas.

The trade status changes to `Funded`.

### 4. Seller Delivers the Product

The seller delivers a file, license key, access link, or other digital product through the application. The seller submits a delivery hash or IPFS CID to the contract.

The trade status changes to `Delivered`.

### 5. Buyer Confirms Receipt

The buyer receives the product, verifies it, and clicks `Confirm Receipt`. The contract releases the escrowed funds to the seller and emits a completion event.

The trade status changes to `Completed`.

### 6. Expiry or Dispute

If the seller does not deliver before the deadline, the buyer can call `refundExpired()` and recover the escrowed funds.

A full dispute system is outside the MVP. A future version could use reputation, community arbitration, or a decentralized dispute protocol.

## Important Trust Model

A smart contract cannot directly know whether an offchain file was delivered or whether its quality is acceptable. The MVP should not claim fully automatic delivery verification.

The honest MVP model is:

- The seller commits to a product or delivery hash.
- The seller marks the trade as delivered.
- The buyer confirms receipt.
- The contract releases funds only after buyer confirmation.
- The buyer can request a refund after a missed deadline.

This makes the escrow and settlement trustless while keeping the delivery confirmation human-controlled. Production versions can add encrypted delivery, verifiable credentials, digital assets, or arbitration.

## Currency and Pricing Model

Prices should be denominated in stablecoins rather than MON so that a product keeps a predictable real-world price. A seller should be able to list an item as `$5.00`, not as an amount whose fiat value changes with the MON market price.

- **Payment token:** USDC only for the MVP, because it is widely supported and has a predictable six-decimal format. Additional stablecoins can be added later through a contract allowlist.
- **Display:** The frontend shows `$5.00 USDC` while the contract stores the token's smallest units.
- **Gas:** Buyers and sellers still need a small amount of MON to submit transactions.
- **Testnet fallback:** Use a clearly labeled mock USDC token if an official testnet stablecoin is unavailable.

The escrow contract should not accept arbitrary ERC-20 tokens. It should whitelist the USDC contract address, use OpenZeppelin `SafeERC20`, and store the payment token for every trade.

## Contract Design

### `DigitalEscrow.sol`

The contract should use one deployment with trade IDs rather than deploying a new contract for every product.

Core functions:

- `createListing(uint8 zoneId, address paymentToken, bytes32 productHash, uint256 price, uint64 deadline)`
- `fundTrade(uint256 listingId)` after ERC-20 approval
- `markDelivered(uint256 tradeId, bytes32 deliveryHash)`
- `confirmReceipt(uint256 tradeId)`
- `refundExpired(uint256 tradeId)`
- `raiseDispute(uint256 tradeId)` as an optional feature
- `resolveDispute(uint256 tradeId, address winner)` as a centralized MVP fallback

Each trade stores:

- Seller address
- Buyer address
- Listing ID
- Zone ID
- Payment token address
- Escrow amount
- Product or delivery hash
- Deadline
- Current status

The contract must enforce:

- Only the buyer can start a trade for a listing.
- Only the seller can mark a trade as delivered.
- Only the buyer can confirm receipt.
- Funds cannot be released twice.
- Refunds are possible only after expiry and before completion.
- The seller cannot withdraw escrowed funds before confirmation.
- ERC-20 transfers use `SafeERC20`, reentrancy protection, and safe accounting.
- Only the allowlisted USDC contract can be used for payment.

## Game World

The game is built around a Ragnarok-style global map re-imagined as an ocean chart, with Roblox-style chunky, blocky fish characters:

- A nautical world map screen showing island and reef nodes connected by sea currents, like classic MMO overworld maps drawn as a treasure chart
- Themed ocean zones:
  - **Coral Capital** — a sunlit shallow reef serving as the central hub
  - **Sardine Harbor** — a bustling merchant port with the main marketplace, inspired by old trading-port towns
  - **Shipwreck Cove** — a dim deep-water outpost lit by anglerfish lanterns
- Market squares built on reef shelves, docks, and sunken decks, with two or three coral stalls per zone
- Buyer and seller fish avatars — blocky, rounded fish with simple class-inspired accessories like captain hats, diver goggles, or pearl necklaces
- Seashell and treasure-chest product signs above stalls, with prices shown on floating bubble cards
- Swim-to-interact behavior inside each zone, with gentle drifting movement instead of walking
- Listing and escrow panel styled like a captain's logbook
- Chat or speech bubbles drawn as rising bubbles for the meeting moment
- Trade status feed showing onchain events, styled as messages in bottles
- Fast travel between ocean nodes via the world map's sea currents

The ambience is calm and bright: sunbeams filtering through the water, drifting bubble particles, swaying kelp, passing schools of background fish, and muffled underwater color grading that deepens as the player travels from the sunlit shallows to the darker Shipwreck Cove.

The MVP only needs two ocean nodes on the map (Coral Capital and Sardine Harbor), each with a small swimable market square. The experience should feel like a tiny marketplace inside an ocean adventure RPG, not a full game engine. A CSS grid, canvas, or lightweight 2D renderer is sufficient, using blocky sprites to evoke the Roblox look. Full 3D, combat, farming, inventory systems, and persistent multiplayer should be excluded from the MVP.

## Architecture

### Smart Contract Layer

`DigitalEscrow.sol` holds buyer funds, manages trade state, and releases or refunds USDC according to the state machine. MON is only used for gas.

### Frontend

A Next.js application provides:

- Wallet connection
- Ocean world map and zone travel view
- 2D reef market squares
- Coral stalls and product listings
- Buy and escrow flow
- Delivery and confirmation screens
- Live transaction status
- Explorer links

### Delivery Layer

For the demo, the product can be a small downloadable file or license key. The application can serve it after the escrow is funded and the seller marks it delivered. The content hash is shown in the UI and recorded in the trade event.

The production version should use encrypted delivery or a decentralized storage layer so the buyer cannot access the product before payment.

### Demo Accounts

Use one pre-funded seller wallet and one pre-funded buyer wallet. The buyer and seller can be displayed in two browser tabs so the full transaction can be demonstrated without building real-time multiplayer infrastructure.

## Six-Hour MVP Scope

- **Contract, 1.5 hours:** Build and test one `DigitalEscrow.sol` contract with allowlisted USDC funding, delivery, confirmation, and expiry refund.
- **Game world, 1.5 hours:** Build the ocean map screen plus two reef nodes, each with a market square, two stalls, and simple swim or click-to-interact controls.
- **Marketplace UI, 1.5 hours:** Add listing details, escrow status, delivery action, confirmation action, and transaction history.
- **Delivery flow, 45 minutes:** Use one demo digital product with a hash or CID and a gated download screen.
- **Deployment and rehearsal, 45 minutes:** Deploy to Monad testnet, pre-fund both wallets, test the successful and refund paths, and record a fallback video.

## Demo Script

1. Open the ocean map as the buyer fish and ride the sea current to Sardine Harbor.
2. Swim to the `Pixel Reef Starter Pack` stall in the market square.
3. Open the listing and click `Buy for $5.00 USDC`.
4. Show the buyer's funds moving into the escrow contract.
5. Switch to the seller view and show the new funded order.
6. Seller delivers the product and submits its delivery hash.
7. Buyer receives the download and clicks `Confirm Receipt`.
8. Show the escrow status changing to `Completed`.
9. Show the seller's USDC balance increasing and the transaction confirming on Monad.
10. If time allows, travel to Shipwreck Cove and repeat with a seller who does not deliver to demonstrate the expiry refund.

The key visual moment is:

> **Buyer fish swims the ocean, meets seller fish -> escrow funded -> product delivered -> seller paid.**

## Why Monad Matters

- Sub-cent fees make small stablecoin purchases viable.
- Fast finality keeps escrow state changes inside the game interaction instead of showing a long pending spinner.
- High throughput supports many small marketplace transactions and future concurrent reefs.
- EVM compatibility provides a fast path for Solidity, Foundry, wagmi, and viem development.
- Synchronous transaction receipt handling can show a visible `Settled in under a second` confirmation.

The strongest Monad argument is not that the game needs a blockchain for every movement. It is that real-world-priced stablecoin settlement can happen cheaply and quickly without requiring a centralized payment processor to custody the funds. The product price remains stable while Monad makes the escrow interaction fast and inexpensive.

## Revenue Model

- Small marketplace fee in the same stablecoin used by the trade
- Featured or premium seller stalls
- Sponsored reef events and seasonal markets
- Creator fees for premium digital product categories
- Optional subscription for seller analytics and storefront customization

For the hackathon, the fee can be disabled or set to a very small testnet amount.

## Future Versions

### V2

- Real-time multiplayer reef presence
- Encrypted file delivery
- Seller and buyer reputation
- Product collections and inventories
- Additional stablecoins and cross-chain settlement
- In-game chat and private trade rooms
- More ocean zones on the world map with regional market themes
- Fish species selection and cosmetic customization

### V3

- Decentralized dispute arbitration
- Verifiable digital licenses
- NFT-backed game assets
- Multiple oceans and creator-owned marketplaces
- Cross-game digital product portability
- Player-owned reef territories and guild market docks

## Risks and Cut Lines

### Delivery Verification

The contract cannot verify the quality of an offchain product. Keep the MVP honest: buyer confirmation, delivery hash, and deadline refund. Do not claim automatic verification.

### Disputes

Decentralized arbitration is too large for a six-hour build. Use buyer confirmation and a simple expiry refund. Explain arbitration as the production roadmap.

### Multiplayer Scope

Do not build networking, matchmaking, or a complete game. Use two browser tabs with fixed wallets, an ocean map, and two small reef nodes.

### Map Scope

The ocean map is a screen with zone nodes and fast travel via sea currents, not an open world. Do not build continuous overworld swimming, sea monsters, or quest systems for the MVP.

### Digital Product Access

Do not spend the hackathon building a full encrypted storage system. Use one demo product, a gated download route, and a content hash. Explain encrypted delivery as the next version.

### Smart Contract Safety

Keep the contract small, use OpenZeppelin protections, test every state transition, and deploy early. The escrow contract is the most important part of the project.

## What Makes This a Strong Hackathon Entry

- It has a clear and culturally familiar problem: digital `rekber` escrow.
- The ocean world, fish characters, Ragnarok-style map, and Roblox-style look make the demo memorable and visually engaging.
- The blockchain is load-bearing because it holds and releases the funds.
- The transaction has a complete beginning, middle, and end.
- It combines GameFi and x402 without forcing an unnecessary AI feature.
- It can start as a small demo and grow into a marketplace protocol.

## One-Sentence Pitch

> **MonFish-Market is an ocean-themed marketplace where buyer and seller fish swim across a Ragnarok-style world map to meet in Roblox-look reef markets, fund dollar-priced digital purchases with USDC through Monad escrow, and release payment only after the product is delivered and confirmed.**

## Feasibility Score

**7.5/10 with strict scope control.**

The escrow flow is achievable in six hours. The main risks are building too much game infrastructure and overstating delivery automation. An ocean map with two small, polished reef squares and one complete trade is more convincing than a large unfinished ocean.
