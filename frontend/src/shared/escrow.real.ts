// Real chain-backed EscrowService for Monad testnet.
// Swap for the frontend mock: createChainEscrowService(deployments) — same interface.
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  erc20Abi,
  http,
  parseEventLogs,
  type Abi,
  type PublicClient,
} from 'viem';
import { escrowAbi } from './abi';
import {
  type Address,
  type EscrowService,
  type Hex,
  type Listing,
  type Trade,
  type TradeEvent,
  TradeStatus,
  type TxRef,
} from './escrow';

export interface Deployments {
  chainId: number;
  rpcUrl: string;
  escrow: Address;
  usdc: Address;
}

export function createChainEscrowService(cfg: Deployments): EscrowService {
  const chain = defineChain({
    id: cfg.chainId,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

  let account: Address | undefined;

  const injected = () => {
    const ethereum = (globalThis as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error('No injected wallet found — install MetaMask');
    return createWalletClient({ chain, transport: custom(ethereum as Parameters<typeof custom>[0]) });
  };

  const requireAccount = (): Address => {
    if (!account) throw new Error('Wallet not connected — call connectWallet() first');
    return account;
  };

  // Monad charges gas on the LIMIT, not usage: simulate first so a revert never
  // reaches the wallet popup, and cap the limit at estimate +10%.
  async function send(params: {
    address: Address;
    abi: typeof escrowAbi | typeof erc20Abi;
    functionName: string;
    args: readonly unknown[];
  }): Promise<TxRef> {
    const from = requireAccount();
    const call = {
      account: from,
      address: params.address,
      abi: params.abi as Abi,
      functionName: params.functionName,
      args: params.args as unknown[],
    };
    const { request } = await publicClient.simulateContract(call); // throws with revert reason pre-popup
    const estimate = await publicClient.estimateContractGas(call);
    const txHash = await injected().writeContract({ ...request, gas: estimate + estimate / 10n });
    return makeTxRef(publicClient, txHash);
  }

  return {
    async connectWallet() {
      const [addr] = await injected().requestAddresses();
      if (!addr) throw new Error('Wallet returned no account');
      account = addr;
      return addr;
    },

    async getUsdcBalance(addr) {
      return publicClient.readContract({
        address: cfg.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [addr],
      });
    },

    async getListings() {
      const count = await publicClient.readContract({
        address: cfg.escrow,
        abi: escrowAbi,
        functionName: 'listingCount',
      });
      const listings: Listing[] = [];
      for (let id = 1n; id <= count; id++) {
        const [seller, zoneId, deliveryWindow, price, productHash] = await publicClient.readContract({
          address: cfg.escrow,
          abi: escrowAbi,
          functionName: 'listings',
          args: [id],
        });
        listings.push({
          id,
          zoneId,
          seller,
          priceUsdc: price,
          productHash,
          deliveryWindowSecs: Number(deliveryWindow),
        });
      }
      return listings;
    },

    getTrade: (id) => readTrade(publicClient, cfg.escrow, id),

    async getMyTrades() {
      const me = requireAccount();
      const count = await publicClient.readContract({
        address: cfg.escrow,
        abi: escrowAbi,
        functionName: 'tradeCount',
      });
      const mine: Trade[] = [];
      for (let id = 1n; id <= count; id++) {
        const trade = await readTrade(publicClient, cfg.escrow, id);
        if (trade.buyer.toLowerCase() === me.toLowerCase()) mine.push(trade);
      }
      return mine;
    },

    approveUsdc: (amount) =>
      send({ address: cfg.usdc, abi: erc20Abi, functionName: 'approve', args: [cfg.escrow, amount] }),

    async fundTrade(listingId) {
      const tx = await send({
        address: cfg.escrow,
        abi: escrowAbi,
        functionName: 'fundTrade',
        args: [listingId],
      });
      // The trade id must come from the mined TradeFunded log — a simulation-time
      // return value can race a concurrent trade and report the wrong id.
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx.txHash });
      const [funded] = parseEventLogs({ abi: escrowAbi, eventName: 'TradeFunded', logs: receipt.logs });
      if (!funded) throw new Error('fundTrade succeeded but no TradeFunded event found');
      return { tradeId: funded.args.tradeId, tx };
    },

    confirmReceipt: (tradeId) =>
      send({ address: cfg.escrow, abi: escrowAbi, functionName: 'confirmReceipt', args: [tradeId] }),

    refundExpired: (tradeId) =>
      send({ address: cfg.escrow, abi: escrowAbi, functionName: 'refundExpired', args: [tradeId] }),

    async markDelivered() {
      throw new Error('Seller acts via scripts/deliver.sh in the demo');
    },

    onTradeEvent(cb) {
      // One gapless poller tracking the last-seen block — viem's per-event
      // watchers can miss logs around their initialization block.
      const names = new Set(['TradeFunded', 'TradeDelivered', 'TradeCompleted', 'TradeRefunded']);
      let lastBlock: bigint | undefined;
      let polling = false;
      const tick = async () => {
        if (polling) return;
        polling = true;
        try {
          const latest = await publicClient.getBlockNumber();
          if (lastBlock === undefined) lastBlock = latest - 1n;
          if (latest > lastBlock) {
            const logs = await publicClient.getLogs({
              address: cfg.escrow,
              fromBlock: lastBlock + 1n,
              toBlock: latest,
            });
            for (const log of parseEventLogs({ abi: escrowAbi, logs })) {
              if (!names.has(log.eventName)) continue;
              const { tradeId } = log.args as { tradeId: bigint };
              cb({
                type: log.eventName.replace('Trade', '') as TradeEvent['type'],
                tradeId,
                txHash: log.transactionHash,
              });
            }
            lastBlock = latest;
          }
        } finally {
          polling = false;
        }
      };
      void tick();
      const interval = setInterval(() => void tick(), 2_000);
      return () => clearInterval(interval);
    },
  };
}

async function readTrade(publicClient: PublicClient, escrow: Address, id: bigint): Promise<Trade> {
  const [listingId, buyer, deadline, status, amount, deliveryHash] = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'trades',
    args: [id],
  });
  const [seller] = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'listings',
    args: [listingId],
  });
  return {
    id,
    listingId,
    buyer,
    seller,
    amountUsdc: amount,
    deadline: Number(deadline),
    status: status as TradeStatus,
    deliveryHash:
      deliveryHash === '0x0000000000000000000000000000000000000000000000000000000000000000'
        ? undefined
        : deliveryHash,
  };
}

// wait() resolves at FINALIZED state (~800ms on Monad) — gate irreversible UI on it.
function makeTxRef(publicClient: PublicClient, txHash: Hex): TxRef {
  return {
    txHash,
    async wait() {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      for (;;) {
        const finalized = await publicClient.getBlock({ blockTag: 'finalized' });
        if (finalized.number >= receipt.blockNumber) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return receipt.status === 'success' ? 'success' : 'reverted';
    },
  };
}
