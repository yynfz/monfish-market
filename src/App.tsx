import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatUsdc, TradeStatus, ZONES, type Address, type EscrowService, type Trade } from '../shared/escrow';
import { createMockEscrowService } from '../shared/escrow.mock';
import { keccak256 } from 'viem';
import { getListingMetadata, LISTINGS, type CanonicalListing } from './listings';

type Point = { x: number; y: number };

const WORLD_BOUNDS = { left: 5, right: 88, top: 24, bottom: 78 } as const;
const MOVE_STEP = 8;
const STALLS: Record<number, readonly { listingId: bigint; x: number; y: number }[]> = {
  0: [{ listingId: 3n, x: 30, y: 59 }],
  1: [
    { listingId: 1n, x: 18, y: 59 },
    { listingId: 2n, x: 48, y: 59 },
  ],
};

function formatDeliveryWindow(seconds: number) {
  return seconds === 60 ? '60 seconds' : `${seconds / 3_600} hours`;
}

function ShellIcon({ name }: { name: 'compass' | 'stall' | 'close' | 'bag' | 'chat' }) {
  const paths = {
    compass: <><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7Z" /></>,
    stall: <><path d="M4 10v9h16v-9" /><path d="M3 10h18l-2-5H5l-2 5Z" /><path d="M8 19v-5h5v5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    chat: <path d="M5 5h14v10H9l-4 4V5Z" />,
  };

  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">{paths[name]}</svg>;
}

type CommerceProps = {
  account: Address | null;
  busy: boolean;
  service: EscrowService;
  trade: Trade | null;
  refresh: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  unlocked: boolean;
  unlock: () => void;
};

function CommercePanel({ account, busy, listing, refresh, service, setBusy, trade, unlock, unlocked }: CommerceProps & { listing: CanonicalListing }) {
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState(false);

  async function run(label: string, action: () => Promise<{ wait(): Promise<'success' | 'reverted'> }>) {
    if (busy) return false;
    setBusy(true);
    setMessage(`${label}: Awaiting Wallet…`);
    try {
      const tx = await action();
      setMessage(`${label}: Pending…`);
      const result = await tx.wait();
      if (result !== 'success') throw new Error('Transaction reverted');
      setMessage(`${label} finalized.`);
      await refresh();
      return true;
    } catch (error) {
      setMessage(`${label} Failed: ${(error as Error).message}. Check Status before retrying.`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!account) return <p className="commerce-note">Connect the demo wallet to create a Trade.</p>;

  if (!trade) return (
    <div className="commerce-actions">
      {!approved ? (
        <button className="primary-action" disabled={busy} onClick={async () => {
          const succeeded = await run('Approval', () => service.approveUsdc(listing.priceUsdc));
          if (succeeded) setApproved(true);
        }} type="button">Approve {formatUsdc(listing.priceUsdc)} MockUSDC</button>
      ) : (
        <button className="primary-action" disabled={busy} onClick={async () => {
          if (busy) return;
          setBusy(true);
          setMessage('Funding: Pending…');
          try {
            const result = await service.fundTrade(listing.id);
            await result.tx.wait();
            setMessage('Funding finalized.');
            await refresh();
          } catch (error) {
            setMessage(`Funding Failed: ${(error as Error).message}. Check Status before retrying.`);
          } finally { setBusy(false); }
        }} type="button">Fund Trade</button>
      )}
      {message ? <p className="action-message" role="status">{message}</p> : null}
    </div>
  );

  const status = TradeStatus[trade.status];
  const expired = Math.floor(Date.now() / 1000) > trade.deadline;
  const canRefund = trade.status !== TradeStatus.Completed && trade.status !== TradeStatus.Refunded;

  async function verifyArtifact() {
    const deliveryHash = trade?.deliveryHash;
    if (!deliveryHash) return;
    setMessage('Verifying artifact…');
    try {
      const response = await fetch(`/${getListingMetadata(listing.id)!.artifactFile}`);
      const hash = keccak256(new Uint8Array(await response.arrayBuffer()));
      if (hash.toLowerCase() !== listing.productHash.toLowerCase() || hash.toLowerCase() !== deliveryHash.toLowerCase()) {
        throw new Error('Integrity check failed — hash mismatch');
      }
      setVerified(true);
      unlock();
      setMessage('Artifact verified and unlocked.');
    } catch (error) { setVerified(false); setMessage((error as Error).message); }
  }

  return (
    <section className="trade-panel" aria-label={`Trade ${trade.id}`}>
      <p className={`trade-status status-${status.toLowerCase()}`}><span aria-hidden="true">●</span> {status}</p>
      <p>Delivery Window: {expired ? 'Expired' : 'Active'}</p>
      {trade.deliveryHash ? <code className="delivery-hash">{trade.deliveryHash}</code> : null}
      {trade.status === TradeStatus.Delivered ? <>
        <button className="secondary-action" disabled={busy} onClick={verifyArtifact} type="button">Verify and unlock artifact</button>
        <button className="primary-action" disabled={busy || !verified} onClick={() => run('Confirmation', () => service.confirmReceipt(trade.id))} type="button">Confirm Receipt</button>
      </> : null}
      {unlocked ? <a className="artifact-download" download href={`/${getListingMetadata(listing.id)!.artifactFile}`}>Download verified artifact</a> : null}
      {trade.status === TradeStatus.Completed ? <p>✅ Seller paid. Artifact remains unlocked.</p> : null}
      {canRefund ? <button className="secondary-action" disabled={busy || !expired} onClick={() => run('Refund', () => service.refundExpired(trade.id))} type="button">Reclaim Funds</button> : null}
      {message ? <p className="action-message" role="status">{message}</p> : null}
      <button className="check-status" disabled={busy} onClick={() => void refresh()} type="button">Check Status</button>
    </section>
  );
}

function ListingDrawer({ commerce, listing, onClose }: { commerce: CommerceProps; listing: CanonicalListing; onClose: () => void }) {
  const [draftOpen, setDraftOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const draftActionRef = useRef<HTMLButtonElement>(null);
  const metadata = getListingMetadata(listing.id);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    function containFocus(event: FocusEvent) {
      if (!drawerRef.current?.contains(event.target as Node)) closeButtonRef.current?.focus();
    }

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('focusin', containFocus);
    };
  }, [onClose]);

  useEffect(() => {
    if (document.activeElement === document.body) draftActionRef.current?.focus();
  }, [draftOpen]);

  if (!metadata) return null;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href]') ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <aside
      aria-label={`${metadata.name} details`}
      aria-modal="true"
      className="listing-drawer"
      onKeyDown={handleKeyDown}
      ref={drawerRef}
      role="dialog"
    >
      <div aria-hidden="true" className="drawer-handle" />
      <button aria-label="Close listing details" className="icon-button drawer-close" onClick={onClose} ref={closeButtonRef} type="button">
        <ShellIcon name="close" />
      </button>
      <p className="seller-name">{metadata.sellerName} says</p>
      <blockquote><span>{metadata.dialogue}</span></blockquote>
      <h3>{metadata.name}</h3>
      <p className="listing-id">Listing #{listing.id.toString()}</p>
      <p className="description">{metadata.description}</p>
      <dl className="listing-facts">
        <div><dt>Product price</dt><dd>{formatUsdc(listing.priceUsdc)} MockUSDC</dd></div>
        <div><dt>Delivery</dt><dd>Delivery window: {formatDeliveryWindow(listing.deliveryWindowSecs)}</dd></div>
      </dl>
      <details className="artifact-proof"><summary>Artifact proof</summary><code>{listing.productHash}</code></details>
      {draftOpen ? (
        <section aria-labelledby="checkout-title" className="checkout-draft">
          <h4 id="checkout-title">Checkout draft</h4>
          <p><strong>{formatUsdc(listing.priceUsdc)} MockUSDC</strong> for {metadata.name}</p>
          <p>No Trade has been created.</p>
          <button className="secondary-action" onClick={() => setDraftOpen(false)} ref={draftActionRef} type="button">Discard checkout draft</button>
        </section>
      ) : (
        <button className="primary-action" onClick={() => setDraftOpen(true)} ref={draftActionRef} type="button">
          <ShellIcon name="bag" /> Open checkout draft
        </button>
      )}
      <CommercePanel {...commerce} listing={listing} />
    </aside>
  );
}

function positionStyle(point: Point): CSSProperties {
  return { left: `${point.x}%`, top: `${point.y}%` };
}

function isInsideStall(point: Point, zoneId: number) {
  return STALLS[zoneId].some((stall) =>
    point.x >= stall.x - 5 && point.x <= stall.x + 20 && point.y >= stall.y - 6 && point.y <= stall.y + 18,
  );
}

function nearbyListing(position: Point, zoneId: number) {
  const stall = STALLS[zoneId].find((candidate) =>
    Math.abs(position.x - (candidate.x + 10)) <= 14 && Math.abs(position.y - (candidate.y + 17)) <= 12,
  );
  return stall ? LISTINGS.find((listing) => listing.id === stall.listingId) ?? null : null;
}

function MarketScene({ zoneId, onAnnouncement, onSelectListing }: {
  zoneId: number;
  onAnnouncement: (message: string) => void;
  onSelectListing: (listing: CanonicalListing, trigger: HTMLButtonElement) => void;
}) {
  const zone = ZONES.find((candidate) => candidate.id === zoneId)!;
  const zoneListings = LISTINGS.filter((listing) => listing.zoneId === zoneId);
  const [position, setPosition] = useState<Point>({ x: 78, y: 76 });
  const proximityListing = nearbyListing(position, zoneId);
  const proximityRef = useRef<HTMLButtonElement>(null);
  const previousProximityRef = useRef<CanonicalListing | null>(null);

  useEffect(() => setPosition({ x: 78, y: 76 }), [zoneId]);

  useEffect(() => {
    const previous = previousProximityRef.current;
    if (proximityListing) {
      const metadata = getListingMetadata(proximityListing.id)!;
      proximityRef.current?.focus();
      onAnnouncement(`${metadata.sellerName} is nearby. Press Enter to talk.`);
    } else if (previous) {
      const metadata = getListingMetadata(previous.id)!;
      onAnnouncement(`Moved away from ${metadata.sellerName}.`);
    }
    previousProximityRef.current = proximityListing;
  }, [onAnnouncement, proximityListing]);

  useEffect(() => {
    function moveBuyer(event: KeyboardEvent) {
      const directions: Record<string, Point> = {
        ArrowLeft: { x: -MOVE_STEP, y: 0 }, a: { x: -MOVE_STEP, y: 0 }, A: { x: -MOVE_STEP, y: 0 },
        ArrowRight: { x: MOVE_STEP, y: 0 }, d: { x: MOVE_STEP, y: 0 }, D: { x: MOVE_STEP, y: 0 },
        ArrowUp: { x: 0, y: -MOVE_STEP }, w: { x: 0, y: -MOVE_STEP }, W: { x: 0, y: -MOVE_STEP },
        ArrowDown: { x: 0, y: MOVE_STEP }, s: { x: 0, y: MOVE_STEP }, S: { x: 0, y: MOVE_STEP },
      };
      const direction = directions[event.key];
      if (!direction || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setPosition((current) => {
        const candidate = {
          x: Math.min(WORLD_BOUNDS.right, Math.max(WORLD_BOUNDS.left, current.x + direction.x)),
          y: Math.min(WORLD_BOUNDS.bottom, Math.max(WORLD_BOUNDS.top, current.y + direction.y)),
        };
        return isInsideStall(candidate, zoneId) ? current : candidate;
      });
    }
    document.addEventListener('keydown', moveBuyer);
    return () => document.removeEventListener('keydown', moveBuyer);
  }, [zoneId]);

  return (
    <section aria-label="Market playfield" className={`playfield zone-${zoneId}`}>
      <div aria-hidden="true" className="water-light water-light-one" />
      <div aria-hidden="true" className="water-light water-light-two" />
      <div aria-hidden="true" className="seabed" />
      <div aria-hidden="true" className="scene-landmark"><span /><span /><span /></div>
      <div className="zone-copy"><h2>{zone.name}</h2><p>{zoneId === 0 ? 'Sunlit workshops in the shallows' : 'Trade lights beneath the old docks'}</p></div>

      {zoneListings.map((listing) => {
        const metadata = getListingMetadata(listing.id);
        const stall = STALLS[zoneId].find((candidate) => candidate.listingId === listing.id);
        if (!metadata || !stall) return null;
        return (
          <button
            aria-label={`Talk to ${metadata.sellerName}`}
            className="seller-stall"
            key={listing.id.toString()}
            onClick={(event) => onSelectListing(listing, event.currentTarget)}
            style={positionStyle(stall)}
            type="button"
          >
            <span aria-hidden="true" className="seller-fish"><i /></span>
            <span aria-hidden="true" className="stall-awning"><i /><i /><i /></span>
            <span className="stall-name">{metadata.sellerName}</span>
            <span className="stall-price">{formatUsdc(listing.priceUsdc)} MockUSDC</span>
          </button>
        );
      })}

      {proximityListing ? (() => {
        const metadata = getListingMetadata(proximityListing.id)!;
        return (
          <button
            aria-label={`Talk to ${metadata.sellerName} nearby`}
            className="proximity-prompt"
            onClick={(event) => onSelectListing(proximityListing, event.currentTarget)}
            ref={proximityRef}
            type="button"
          >
            <ShellIcon name="chat" /> Talk to {metadata.sellerName} <kbd>Enter</kbd>
          </button>
        );
      })() : null}

      <div aria-label={`Buyer position ${position.x}, ${position.y}`} className="buyer-fish" role="img" style={positionStyle(position)}>
        <span aria-hidden="true" className="fish-tail" /><span aria-hidden="true" className="fish-body"><i /></span>
      </div>
    </section>
  );
}

function BrowseStalls({ zoneId, onAnnouncement, onSelectListing }: {
  zoneId: number;
  onAnnouncement: (message: string) => void;
  onSelectListing: (listing: CanonicalListing, trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const firstListingRef = useRef<HTMLButtonElement>(null);
  const zone = ZONES.find((candidate) => candidate.id === zoneId)!;
  const listings = LISTINGS.filter((listing) => listing.zoneId === zoneId);

  function setBrowseOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onAnnouncement(`${nextOpen ? 'Opened' : 'Closed'} ${zone.name} Browse Stalls.`);
  }

  useLayoutEffect(() => {
    if (open) firstListingRef.current?.focus();
  }, [open]);

  useEffect(() => setOpen(false), [zoneId]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault();
        setBrowseOpen(false);
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, zone.name]);

  return (
    <div className="browse-stalls">
      <button
        aria-expanded={open}
        className="browse-action"
        onClick={() => setBrowseOpen(!open)}
        type="button"
      >
        <ShellIcon name="stall" /> Browse Stalls
      </button>
      {open ? (
        <div aria-label={`${zone.name} stalls`} className="browse-menu">
          {listings.map((listing, index) => {
            const metadata = getListingMetadata(listing.id)!;
            return (
              <button
                key={listing.id.toString()}
                onClick={(event) => onSelectListing(listing, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Space') {
                    event.preventDefault();
                    onSelectListing(listing, event.currentTarget);
                  }
                }}
                ref={index === 0 ? firstListingRef : undefined}
                type="button"
              >
                <span>{metadata.name}</span><small>{formatUsdc(listing.priceUsdc)} MockUSDC</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type DemoController = {
  expireTrade(tradeId: bigint): void;
  getDemoAccount(): Address | undefined;
  releaseDelayedAction(): void;
  resetDemo(): void;
  setNextAction(mode: 'fail' | 'delay'): void;
};

export function MarketplaceApp({ demo, service }: { demo?: DemoController; service: EscrowService }) {
  const [account, setAccount] = useState<Address | null>(() => demo?.getDemoAccount() ?? null);
  const [balance, setBalance] = useState(0n);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [busy, setBusy] = useState(false);
  const [unlockedListings, setUnlockedListings] = useState<Set<bigint>>(() => new Set());
  const [zoneId, setZoneId] = useState<number>(ZONES[0].id);
  const [selectedListing, setSelectedListing] = useState<CanonicalListing | null>(null);
  const [announcement, setAnnouncement] = useState('Marketplace ready.');
  const listingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const refresh = useCallback(async () => {
    if (!account) return;
    const [nextTrades, nextBalance] = await Promise.all([service.getMyTrades(), service.getUsdcBalance(account)]);
    setTrades(nextTrades);
    setBalance(nextBalance);
  }, [account, service]);

  useEffect(() => { if (account) void refresh(); }, [account, refresh]);

  async function connect() {
    const nextAccount = await service.connectWallet();
    setAccount(nextAccount);
    setBalance(await service.getUsdcBalance(nextAccount));
    setTrades(await service.getMyTrades());
    setAnnouncement('Demo wallet connected.');
  }

  async function demoDeliver(trade: Trade, hash: `0x${string}`) {
    if (busy) return;
    setBusy(true);
    try {
      const tx = await service.markDelivered(trade.id, hash);
      await tx.wait();
      await refresh();
      setAnnouncement(`Trade ${trade.id} delivery finalized.`);
    } catch (error) {
      setAnnouncement(`Delivery Failed: ${(error as Error).message}.`);
    } finally { setBusy(false); }
  }

  function enterZone(nextZoneId: number) {
    setZoneId(nextZoneId);
    setSelectedListing(null);
    setAnnouncement(`Entered ${ZONES.find((zone) => zone.id === nextZoneId)!.name}.`);
  }

  function openListing(listing: CanonicalListing, trigger: HTMLButtonElement) {
    const metadata = getListingMetadata(listing.id)!;
    listingTriggerRef.current = trigger;
    setSelectedListing(listing);
    setAnnouncement(`Opened ${metadata.name} with ${metadata.sellerName}.`);
  }

  function closeListing() {
    const metadata = selectedListing ? getListingMetadata(selectedListing.id) : null;
    setSelectedListing(null);
    setAnnouncement(`Closed ${metadata?.name ?? 'Seller interaction'}.`);
    requestAnimationFrame(() => listingTriggerRef.current?.focus());
  }

  return (
    <main className="app-shell">
      <p className="desktop-notice"><span aria-hidden="true">🖥️</span> MonFish-Market is a desktop demo. Please open it at 1024px or wider.</p>
      <div className="desktop-experience">
        <header className="app-header">
          <div><span className="demo-badge">Demo Mode</span><h1>MonFish-Market</h1></div>
          <div className="wallet-summary"><p className="token-note">MockUSDC is the product token. MON pays gas only.</p>{account ? <strong>{formatUsdc(balance)} MockUSDC</strong> : <button onClick={connect} type="button">Connect demo wallet</button>}</div>
        </header>
        <section aria-label="Demo Mode controls" className="demo-controls">
          <strong>🧪 Demo Mode controls</strong>
          {demo ? trades.filter((trade) => trade.status === TradeStatus.Funded).map((trade) => {
            const listing = LISTINGS.find((candidate) => candidate.id === trade.listingId)!;
            const name = getListingMetadata(listing.id)!.name;
            return <span key={trade.id.toString()}><button disabled={busy} onClick={() => void demoDeliver(trade, listing.productHash)} type="button">Mark Delivered — {name}</button><button disabled={busy} onClick={() => void demoDeliver(trade, `0x${'00'.repeat(32)}`)} type="button">Deliver bad hash — {name}</button><button disabled={busy} onClick={() => { demo.expireTrade(trade.id); void refresh(); }} type="button">Expire — {name}</button></span>;
          }) : null}
          {demo ? <><button disabled={busy} onClick={() => { demo.setNextAction('fail'); setAnnouncement('Next wallet action will fail.'); }} type="button">Fail next action</button>
          <button disabled={busy} onClick={() => { demo.setNextAction('delay'); setAnnouncement('Next wallet action will remain pending.'); }} type="button">Delay next action</button>
          <button onClick={() => { demo.releaseDelayedAction(); setAnnouncement('Delayed action released.'); }} type="button">Release delayed action</button>
          <button disabled={busy} onClick={() => { demo.resetDemo(); setAccount(null); setTrades([]); setBalance(0n); setUnlockedListings(new Set()); setSelectedListing(null); setAnnouncement('Demo reset.'); }} type="button">Reset Demo</button></> : <span>Live Escrow Service</span>}
        </section>
        <nav aria-label="Choose a Zone" className="zone-picker">
          <ShellIcon name="compass" />
          {ZONES.map((zone) => (
            <button aria-current={zone.id === zoneId ? 'page' : undefined} className={zone.id === zoneId ? 'active' : undefined} key={zone.id} onClick={() => enterZone(zone.id)} type="button">
              Enter {zone.name}
            </button>
          ))}
        </nav>
        <div className="playfield-shell">
          <MarketScene onAnnouncement={announce} onSelectListing={openListing} zoneId={zoneId} />
          <BrowseStalls onAnnouncement={announce} onSelectListing={openListing} zoneId={zoneId} />
          {selectedListing ? <ListingDrawer commerce={{ account, busy, service, trade: trades.find((trade) => trade.listingId === selectedListing.id) ?? null, refresh, setBusy, unlocked: unlockedListings.has(selectedListing.id), unlock: () => setUnlockedListings((current) => new Set(current).add(selectedListing.id)) }} key={selectedListing.id.toString()} listing={selectedListing} onClose={closeListing} /> : null}
        </div>
        <p className="demo-footnote">Use WASD or arrow keys to swim. Click a Seller or use Browse Stalls without moving.</p>
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">{announcement}</p>
    </main>
  );
}

export default function App() {
  const [mock] = useState(() => createMockEscrowService({ finalityDelayMs: 0 }));
  return <MarketplaceApp demo={mock} service={mock} />;
}
