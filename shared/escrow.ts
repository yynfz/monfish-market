// MonFish-Market — canonical Escrow Service boundary.
// This file is the single contract between the game frontend and the blockchain.
// The frontend's mock and the real chain implementation both implement `EscrowService`.
// State mapping, zone names, and seed data: docs/integration-memo.md
// Dependency-free on purpose — the mock must not need viem/wagmi.

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/**
 * On-chain trade states. A trade exists only from Funded onward.
 * "Pending" (tx in flight) and "Failed" (tx reverted) are frontend-only
 * presentation states — never returned by this service.
 * There is NO "cancelled" state anywhere in the system.
 */
export enum TradeStatus {
  Funded = 0,
  Delivered = 1,
  Completed = 2,
  Refunded = 3,
}

export interface Listing {
  id: bigint;
  zoneId: number; // 0 = Coral Capital, 1 = Sardine Harbor
  seller: Address;
  priceUsdc: bigint; // 6-decimal base units: 5_000_000n = $5.00
  productHash: Hex; // keccak256 of the deliverable file
  deliveryWindowSecs: number; // deadline = fundedAt + window, computed at funding
}

export interface Trade {
  id: bigint;
  listingId: bigint;
  buyer: Address;
  seller: Address;
  amountUsdc: bigint;
  deadline: number; // unix seconds; set when funded
  status: TradeStatus;
  deliveryHash?: Hex; // present once Delivered
}

export interface TxRef {
  txHash: Hex;
  /** Resolves at Monad finality (~800ms). Gate irreversible UI (download unlock,
   *  "seller paid" banner) on this, not on submission. */
  wait(): Promise<'success' | 'reverted'>;
}

export type TradeEvent = {
  type: 'Funded' | 'Delivered' | 'Completed' | 'Refunded';
  tradeId: bigint;
  txHash: Hex;
};

export interface EscrowService {
  connectWallet(): Promise<Address>;
  getUsdcBalance(addr: Address): Promise<bigint>;
  getListings(): Promise<Listing[]>;
  getTrade(id: bigint): Promise<Trade>;
  getMyTrades(): Promise<Trade[]>;

  /** Buy step 1 of 2: exact-amount USDC approval. Its own wallet popup — narrate it. */
  approveUsdc(amount: bigint): Promise<TxRef>;
  /** Buy step 2 of 2: pulls the approved USDC into escrow. Trade starts as Funded. */
  fundTrade(listingId: bigint): Promise<{ tradeId: bigint; tx: TxRef }>;
  /** Buyer-only. Releases escrow to the seller. Terminal. */
  confirmReceipt(tradeId: bigint): Promise<TxRef>;
  /** Buyer-only. Allowed only after `deadline`, while not Completed. Terminal. */
  refundExpired(tradeId: bigint): Promise<TxRef>;
  /** Seller action. Mock: wire to a hidden dev-panel button to advance the lifecycle.
   *  Real impl may throw — the seller acts via Foundry script in the demo. */
  markDelivered(tradeId: bigint, deliveryHash: Hex): Promise<TxRef>;

  /** Live transition feed (the "messages in bottles" UI). Returns unsubscribe. */
  onTradeEvent(cb: (e: TradeEvent) => void): () => void;
}

export const ZONES = [
  { id: 0, name: 'Coral Capital' },
  { id: 1, name: 'Sardine Harbor' },
] as const;

/** Format 6-decimal base units as "$5.00". */
export function formatUsdc(amount: bigint): string {
  const cents = amount / 10_000n;
  return `$${(Number(cents) / 100).toFixed(2)}`;
}
