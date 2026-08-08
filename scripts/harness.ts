// Verification harness for issue #4: drives the REAL createChainEscrowService
// (same code path the frontend will use) against the live testnet deployment.
// A local throwaway key is shimmed in as the injected EIP-1193 wallet.
// Run: npx tsx scripts/harness.ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createChainEscrowService, type Deployments } from '../shared/escrow.real';
import { TradeStatus, formatUsdc, type TradeEvent } from '../shared/escrow';

const cfg: Deployments & { seller: `0x${string}` } = JSON.parse(
  readFileSync('shared/deployments.json', 'utf8'),
);
const key = process.env.HARNESS_BUYER_PRIVATE_KEY as `0x${string}`;
if (!key) throw new Error('HARNESS_BUYER_PRIVATE_KEY not set (source contracts/.env)');

const chain = defineChain({
  id: cfg.chainId,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
});
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const rpc = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

// Minimal EIP-1193 provider backed by the local key — stands in for MetaMask.
(globalThis as Record<string, unknown>).ethereum = {
  request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address];
    if (method === 'eth_chainId') return `0x${cfg.chainId.toString(16)}`;
    if (method === 'eth_sendTransaction') {
      const tx = (params as [{ to: `0x${string}`; data: `0x${string}`; gas?: `0x${string}` }])[0];
      return wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
    }
    return rpc.request({ method, params } as Parameters<typeof rpc.request>[0]);
  },
};

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const svc = createChainEscrowService(cfg);
const events: TradeEvent[] = [];
const unsubscribe = svc.onTradeEvent((e) => {
  events.push(e);
  console.log(`  event: ${e.type} trade=${e.tradeId}`);
});

const me = await svc.connectWallet();
assert(me.toLowerCase() === account.address.toLowerCase(), 'connectWallet returns shim account');

const listings = await svc.getListings();
assert(listings.length >= 3, `getListings sees seed listings (${listings.length})`);
assert(formatUsdc(listings[0]!.priceUsdc) === '$5.00', 'listing 1 priced $5.00');

// --- Happy path: listing 1 (Starter Pack, $5, 24h) ---
console.log('\nHappy path:');
const sellerBefore = await svc.getUsdcBalance(cfg.seller);
await (await svc.approveUsdc(listings[0]!.priceUsdc)).wait();
const { tradeId, tx: fundTx } = await svc.fundTrade(1n);
assert((await fundTx.wait()) === 'success', `fundTrade finalized (trade ${tradeId})`);

execSync(`scripts/deliver.sh ${tradeId} assets/pixel-reef-starter-pack.zip`, { stdio: 'inherit' });
const delivered = await svc.getTrade(tradeId);
assert(delivered.status === TradeStatus.Delivered, 'trade Delivered after deliver.sh');
assert(delivered.deliveryHash !== undefined, 'delivery hash recorded');

assert((await (await svc.confirmReceipt(tradeId)).wait()) === 'success', 'confirmReceipt finalized');
const sellerAfter = await svc.getUsdcBalance(cfg.seller);
assert(sellerAfter - sellerBefore === listings[0]!.priceUsdc, 'seller paid exactly $5.00');

// --- Guardrail: revert caught pre-wallet ---
try {
  await svc.confirmReceipt(tradeId);
  assert(false, 'double-confirm should have thrown');
} catch (err) {
  assert(String(err).includes('not delivered'), 'pre-simulation surfaced revert reason before wallet');
}

// --- Refund path: listing 2 (Ghost Ship, $3, 60s window) ---
console.log('\nRefund path:');
const myBefore = await svc.getUsdcBalance(me);
await (await svc.approveUsdc(listings[1]!.priceUsdc)).wait();
const { tradeId: ghostTrade } = await svc.fundTrade(2n);
console.log(`  funded trade ${ghostTrade}, waiting 65s for the 60s window to expire...`);
await sleep(65_000);
assert((await (await svc.refundExpired(ghostTrade)).wait()) === 'success', 'refundExpired finalized');
assert((await svc.getUsdcBalance(me)) === myBefore, 'buyer balance fully restored');

const mine = await svc.getMyTrades();
assert(mine.some((t) => t.id === tradeId && t.status === TradeStatus.Completed), 'getMyTrades: Completed');
assert(mine.some((t) => t.id === ghostTrade && t.status === TradeStatus.Refunded), 'getMyTrades: Refunded');

await sleep(5_000); // let the event watcher's last poll land
unsubscribe();
const seen = new Set(events.map((e) => e.type));
assert(seen.has('Funded') && seen.has('Completed') && seen.has('Refunded'), `event feed saw ${[...seen]}`);

console.log('\nAll checks passed — issue #4 verified against live testnet.');
process.exit(0);
