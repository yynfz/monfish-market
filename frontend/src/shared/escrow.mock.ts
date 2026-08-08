// MonFish-Market — deterministic in-memory mock EscrowService.
// Implements the same EscrowService interface as the real viem implementation.
// Use this for development and rendered tests. Swap in the real service for demo.
//
// Usage:
//   import { createMockEscrowService } from '../../shared/escrow.mock';
//   const escrow = createMockEscrowService();
//
// Demo wallet addresses come from shared/deployments.json.
// Seed listings mirror on-chain state (chain 10143).

import {
  type Address,
  type EscrowService,
  type Hex,
  type Listing,
  type Trade,
  type TradeEvent,
  type TxRef,
  TradeStatus,
} from './escrow';

// ── Seed data (mirrors on-chain deployment, chain 10143) ───────────────────

const DEMO_BUYER: Address = '0x1d4881AB10CF94269D27a218565fd4c363BCB39a';
const DEMO_SELLER: Address = '0x80fcb18a741771D79f063501867F721be4d11547';

/** Initial mUSDC balances (6-decimal base units). */
const INITIAL_BUYER_USDC = 1_000_000_000n; // 1 000.000000 mUSDC
const INITIAL_SELLER_USDC = 110_000_000n;  //   110.000000 mUSDC

const SEED_LISTINGS: Listing[] = [
  {
    id: 1n,
    zoneId: 1, // Sardine Harbor
    seller: DEMO_SELLER,
    priceUsdc: 5_000_000n, // $5.00
    productHash: '0xed8bb25b2ddf4f5aeb11915ab115717e6038b34a316f389d1c3862d21159671e',
    deliveryWindowSecs: 86_400, // 24 h
  },
  {
    id: 2n,
    zoneId: 1, // Sardine Harbor
    seller: DEMO_SELLER,
    priceUsdc: 3_000_000n, // $3.00
    productHash: '0x4c6979190de330bc50f9cf75cd76e502d6ccdf184d1fc3072da5b51a36688642',
    deliveryWindowSecs: 60, // 60 s — live refund demo
  },
  {
    id: 3n,
    zoneId: 0, // Coral Capital
    seller: DEMO_SELLER,
    priceUsdc: 2_000_000n, // $2.00
    productHash: '0x27128c2665ca52e0994bd4dc0b2e9b5a05817f72beaaa918ead9cbeea31714cf',
    deliveryWindowSecs: 86_400, // 24 h
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

let txCounter = 0;
function nextTxHash(): Hex {
  return `0x${'mock'.repeat(14)}${String(++txCounter).padStart(8, '0')}` as Hex;
}

/**
 * Returns a TxRef whose wait() resolves after `delayMs` (default 800 ms to
 * simulate Monad finality). Tests can pass delayMs=0 for instant resolution.
 */
function makeMockTxRef(delayMs = 800): TxRef {
  const txHash = nextTxHash();
  return {
    txHash,
    wait: () => new Promise((resolve) => setTimeout(() => resolve('success'), delayMs)),
  };
}

// ── Factory ────────────────────────────────────────────────────────────────

export interface MockEscrowOptions {
  /** Override finality delay (ms). Set to 0 in tests for instant resolution. */
  finalityDelayMs?: number;
}

let mockInstance: EscrowService | null = null;

export function getMockService(opts: MockEscrowOptions = {}): EscrowService {
  if (mockInstance) return mockInstance;

  const delay = opts.finalityDelayMs ?? 800;

  // Mutable in-memory state.
  let connectedAccount: Address | undefined;
  const usdcBalances = new Map<Address, bigint>([
    [DEMO_BUYER, INITIAL_BUYER_USDC],
    [DEMO_SELLER, INITIAL_SELLER_USDC],
  ]);
  const trades = new Map<bigint, Trade>();
  let tradeCounter = 0n;
  const eventListeners = new Set<(e: TradeEvent) => void>();

  function emit(type: TradeEvent['type'], tradeId: bigint, txHash: Hex) {
    const event: TradeEvent = { type, tradeId, txHash };
    for (const cb of eventListeners) cb(event);
  }

  function requireAccount(): Address {
    if (!connectedAccount) throw new Error('Wallet not connected — call connectWallet() first');
    return connectedAccount;
  }

  function requireTrade(id: bigint): Trade {
    const trade = trades.get(id);
    if (!trade) throw new Error(`Trade ${id} not found`);
    return trade;
  }

  function getListing(id: bigint): Listing {
    const listing = SEED_LISTINGS.find((l) => l.id === id);
    if (!listing) throw new Error(`Listing ${id} not found`);
    return listing;
  }

  return {
    async connectWallet() {
      connectedAccount = DEMO_BUYER;
      return DEMO_BUYER;
    },

    async getUsdcBalance(addr: Address) {
      return usdcBalances.get(addr) ?? 0n;
    },

    async getListings() {
      return [...SEED_LISTINGS];
    },

    async getTrade(id: bigint) {
      return requireTrade(id);
    },

    async getMyTrades() {
      const me = requireAccount();
      return [...trades.values()].filter(
        (t) => t.buyer.toLowerCase() === me.toLowerCase(),
      );
    },

    async approveUsdc(_amount: bigint) {
      // Approval is a no-op in the mock — fundTrade doesn't check allowance.
      // Still returns a TxRef so the UI can show the Awaiting Wallet → Pending → Approved flow.
      return makeMockTxRef(delay);
    },

    async fundTrade(listingId: bigint) {
      const me = requireAccount();
      const listing = getListing(listingId);

      if (me.toLowerCase() === listing.seller.toLowerCase()) {
        throw new Error('Buyer and seller cannot be the same address');
      }

      const balance = usdcBalances.get(me) ?? 0n;
      if (balance < listing.priceUsdc) {
        throw new Error(`Insufficient mUSDC: have ${balance}, need ${listing.priceUsdc}`);
      }

      const tradeId = ++tradeCounter;
      const deadline = Math.floor(Date.now() / 1000) + listing.deliveryWindowSecs;

      const trade: Trade = {
        id: tradeId,
        listingId: listing.id,
        buyer: me,
        seller: listing.seller,
        amountUsdc: listing.priceUsdc,
        deadline,
        status: TradeStatus.Funded,
      };
      trades.set(tradeId, trade);
      usdcBalances.set(me, balance - listing.priceUsdc);

      const tx = makeMockTxRef(delay);
      // Fire event after wait resolves (mirrors real: event is mined, then finalized).
      void tx.wait().then(() => emit('Funded', tradeId, tx.txHash));

      return { tradeId, tx };
    },

    async markDelivered(tradeId: bigint, deliveryHash: Hex) {
      const trade = requireTrade(tradeId);
      if (trade.status !== TradeStatus.Funded) {
        throw new Error(`markDelivered requires Funded status, got ${TradeStatus[trade.status]}`);
      }
      trades.set(tradeId, { ...trade, status: TradeStatus.Delivered, deliveryHash });

      const tx = makeMockTxRef(delay);
      void tx.wait().then(() => emit('Delivered', tradeId, tx.txHash));
      return tx;
    },

    async confirmReceipt(tradeId: bigint) {
      const trade = requireTrade(tradeId);
      if (trade.status !== TradeStatus.Delivered) {
        throw new Error(`confirmReceipt requires Delivered status, got ${TradeStatus[trade.status]}`);
      }
      trades.set(tradeId, { ...trade, status: TradeStatus.Completed });
      // Credit seller.
      usdcBalances.set(trade.seller, (usdcBalances.get(trade.seller) ?? 0n) + trade.amountUsdc);

      const tx = makeMockTxRef(delay);
      void tx.wait().then(() => emit('Completed', tradeId, tx.txHash));
      return tx;
    },

    async refundExpired(tradeId: bigint) {
      const trade = requireTrade(tradeId);
      if (trade.status === TradeStatus.Completed) {
        throw new Error('Cannot refund a completed trade');
      }
      if (trade.status === TradeStatus.Refunded) {
        throw new Error('Trade already refunded');
      }
      const now = Math.floor(Date.now() / 1000);
      if (now <= trade.deadline) {
        throw new Error('Delivery window has not expired yet');
      }
      trades.set(tradeId, { ...trade, status: TradeStatus.Refunded });
      // Return funds to buyer.
      usdcBalances.set(trade.buyer, (usdcBalances.get(trade.buyer) ?? 0n) + trade.amountUsdc);

      const tx = makeMockTxRef(delay);
      void tx.wait().then(() => emit('Refunded', tradeId, tx.txHash));
      return tx;
    },

    onTradeEvent(cb: (e: TradeEvent) => void) {
      eventListeners.add(cb);
      return () => eventListeners.delete(cb);
    },

    // Demo Mode helper to deterministically expire the delivery window.
    __demoExpireTrade(tradeId: bigint) {
      const trade = requireTrade(tradeId);
      // Expire it 1 second ago.
      trades.set(tradeId, { ...trade, deadline: Math.floor(Date.now() / 1000) - 1 });
    },
  } as EscrowService;
}
