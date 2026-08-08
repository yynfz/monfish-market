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

export interface DemoEscrowService extends EscrowService {
  expireTrade(tradeId: bigint): void;
  getDemoAccount(): Address | undefined;
  resetDemo(): void;
  setNextAction(mode: 'fail' | 'delay'): void;
  releaseDelayedAction(): void;
}

function finalizingTx(delay: number, commit: () => void): TxRef {
  const txHash = nextTxHash();
  let finalized = false;
  return {
    txHash,
    wait: async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!finalized) { commit(); finalized = true; }
      return 'success';
    },
  };
}

export function createMockEscrowService(opts: MockEscrowOptions = {}): DemoEscrowService {
  const delay = opts.finalityDelayMs ?? 800;

  // Mutable in-memory state — fresh per factory call.
  let connectedAccount: Address | undefined;
  const usdcBalances = new Map<Address, bigint>([
    [DEMO_BUYER, INITIAL_BUYER_USDC],
    [DEMO_SELLER, INITIAL_SELLER_USDC],
  ]);
  const trades = new Map<bigint, Trade>();
  let tradeCounter = 0n;
  const eventListeners = new Set<(e: TradeEvent) => void>();
  let nextAction: 'normal' | 'fail' | 'delay' = 'normal';
  let releaseDelay: (() => void) | null = null;

  const storage = typeof localStorage === 'undefined' ? null : localStorage;
  const stored = storage?.getItem('monfish-demo-session');
  if (stored) {
    try {
      const snapshot = JSON.parse(stored) as {
        account?: Address;
        balances: [Address, string][];
        trades: Array<Omit<Trade, 'id' | 'listingId' | 'amountUsdc'> & { id: string; listingId: string; amountUsdc: string }>;
      };
      connectedAccount = snapshot.account;
      usdcBalances.clear();
      snapshot.balances.forEach(([address, amount]) => usdcBalances.set(address, BigInt(amount)));
      snapshot.trades.forEach((trade) => trades.set(BigInt(trade.id), { ...trade, id: BigInt(trade.id), listingId: BigInt(trade.listingId), amountUsdc: BigInt(trade.amountUsdc) }));
      tradeCounter = [...trades.keys()].reduce((highest, id) => id > highest ? id : highest, 0n);
    } catch { storage?.removeItem('monfish-demo-session'); }
  }

  function persist() {
    storage?.setItem('monfish-demo-session', JSON.stringify({
      account: connectedAccount,
      balances: [...usdcBalances].map(([address, amount]) => [address, amount.toString()]),
      trades: [...trades.values()].map((trade) => ({ ...trade, id: trade.id.toString(), listingId: trade.listingId.toString(), amountUsdc: trade.amountUsdc.toString() })),
    }));
  }

  function beforeAction() {
    const mode = nextAction;
    nextAction = 'normal';
    if (mode === 'fail') throw new Error('Demo wallet rejected the action');
    if (mode === 'delay') return new Promise<void>((resolve) => { releaseDelay = resolve; });
    return Promise.resolve();
  }

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
    expireTrade(tradeId) {
      const trade = requireTrade(tradeId);
      trades.set(tradeId, { ...trade, deadline: Math.floor(Date.now() / 1000) - 1 });
      persist();
    },

    getDemoAccount() { return connectedAccount; },

    setNextAction(mode) { nextAction = mode; },
    releaseDelayedAction() { releaseDelay?.(); releaseDelay = null; },

    resetDemo() {
      connectedAccount = undefined;
      trades.clear();
      tradeCounter = 0n;
      usdcBalances.clear();
      usdcBalances.set(DEMO_BUYER, INITIAL_BUYER_USDC);
      usdcBalances.set(DEMO_SELLER, INITIAL_SELLER_USDC);
      storage?.removeItem('monfish-demo-session');
    },
    async connectWallet() {
      connectedAccount = DEMO_BUYER;
      persist();
      return DEMO_BUYER;
    },

    async getUsdcBalance(addr) {
      return usdcBalances.get(addr) ?? 0n;
    },

    async getListings() {
      return [...SEED_LISTINGS];
    },

    async getTrade(id) {
      return requireTrade(id);
    },

    async getMyTrades() {
      const me = requireAccount();
      return [...trades.values()].filter(
        (t) => t.buyer.toLowerCase() === me.toLowerCase(),
      );
    },

    async approveUsdc(_amount) {
      await beforeAction();
      // Approval is a no-op in the mock — fundTrade doesn't check allowance.
      // Still returns a TxRef so the UI can show the Awaiting Wallet → Pending → Approved flow.
      return makeMockTxRef(delay);
    },

    async fundTrade(listingId) {
      await beforeAction();
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
      const tx = finalizingTx(delay, () => {
        trades.set(tradeId, trade);
        usdcBalances.set(me, balance - listing.priceUsdc);
        persist();
        emit('Funded', tradeId, tx.txHash);
      });

      return { tradeId, tx };
    },

    async markDelivered(tradeId, deliveryHash) {
      await beforeAction();
      const trade = requireTrade(tradeId);
      if (trade.status !== TradeStatus.Funded) {
        throw new Error(`markDelivered requires Funded status, got ${TradeStatus[trade.status]}`);
      }
      const tx = finalizingTx(delay, () => {
        trades.set(tradeId, { ...trade, status: TradeStatus.Delivered, deliveryHash });
        persist();
        emit('Delivered', tradeId, tx.txHash);
      });
      return tx;
    },

    async confirmReceipt(tradeId) {
      await beforeAction();
      const trade = requireTrade(tradeId);
      if (trade.status !== TradeStatus.Delivered) {
        throw new Error(`confirmReceipt requires Delivered status, got ${TradeStatus[trade.status]}`);
      }
      const tx = finalizingTx(delay, () => {
        trades.set(tradeId, { ...trade, status: TradeStatus.Completed });
        usdcBalances.set(trade.seller, (usdcBalances.get(trade.seller) ?? 0n) + trade.amountUsdc);
        persist();
        emit('Completed', tradeId, tx.txHash);
      });
      return tx;
    },

    async refundExpired(tradeId) {
      await beforeAction();
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
      const tx = finalizingTx(delay, () => {
        trades.set(tradeId, { ...trade, status: TradeStatus.Refunded });
        usdcBalances.set(trade.buyer, (usdcBalances.get(trade.buyer) ?? 0n) + trade.amountUsdc);
        persist();
        emit('Refunded', tradeId, tx.txHash);
      });
      return tx;
    },

    onTradeEvent(cb) {
      eventListeners.add(cb);
      return () => eventListeners.delete(cb);
    },
  };
}
