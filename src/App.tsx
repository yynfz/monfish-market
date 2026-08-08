import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatUsdc, ZONES } from '../shared/escrow';
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

function ListingDrawer({ listing, onClose }: { listing: CanonicalListing; onClose: () => void }) {
  const [draftOpen, setDraftOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const metadata = getListingMetadata(listing.id);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

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
          <button className="secondary-action" onClick={() => setDraftOpen(false)} type="button">Discard checkout draft</button>
        </section>
      ) : (
        <button className="primary-action" onClick={() => setDraftOpen(true)} type="button">
          <ShellIcon name="bag" /> Open checkout draft
        </button>
      )}
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

function MarketScene({ zoneId, onSelectListing }: {
  zoneId: number;
  onSelectListing: (listing: CanonicalListing, trigger: HTMLButtonElement) => void;
}) {
  const zone = ZONES.find((candidate) => candidate.id === zoneId)!;
  const zoneListings = LISTINGS.filter((listing) => listing.zoneId === zoneId);
  const [position, setPosition] = useState<Point>({ x: 78, y: 76 });
  const proximityListing = nearbyListing(position, zoneId);
  const proximityRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setPosition({ x: 78, y: 76 }), [zoneId]);

  useEffect(() => {
    if (proximityListing) proximityRef.current?.focus();
  }, [proximityListing]);

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

function BrowseStalls({ zoneId, onSelectListing }: {
  zoneId: number;
  onSelectListing: (listing: CanonicalListing, trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const firstListingRef = useRef<HTMLButtonElement>(null);
  const zone = ZONES.find((candidate) => candidate.id === zoneId)!;
  const listings = LISTINGS.filter((listing) => listing.zoneId === zoneId);

  function activateFirstListing(trigger: HTMLButtonElement) {
    const firstListing = listings[0];
    if (firstListing) onSelectListing(firstListing, trigger);
  }

  useLayoutEffect(() => {
    if (open) firstListingRef.current?.focus();
  }, [open]);

  useEffect(() => setOpen(false), [zoneId]);

  return (
    <div className="browse-stalls">
      <button
        aria-expanded={open}
        className="browse-action"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (open && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            activateFirstListing(event.currentTarget);
          }
        }}
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

export default function App() {
  const [zoneId, setZoneId] = useState<number>(ZONES[0].id);
  const [selectedListing, setSelectedListing] = useState<CanonicalListing | null>(null);
  const [announcement, setAnnouncement] = useState('Marketplace ready.');
  const listingTriggerRef = useRef<HTMLButtonElement | null>(null);

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
          <p className="token-note">MockUSDC is the product token. MON pays gas only.</p>
        </header>
        <nav aria-label="Choose a Zone" className="zone-picker">
          <ShellIcon name="compass" />
          {ZONES.map((zone) => (
            <button aria-current={zone.id === zoneId ? 'page' : undefined} className={zone.id === zoneId ? 'active' : undefined} key={zone.id} onClick={() => enterZone(zone.id)} type="button">
              Enter {zone.name}
            </button>
          ))}
        </nav>
        <div className="playfield-shell">
          <MarketScene onSelectListing={openListing} zoneId={zoneId} />
          <BrowseStalls onSelectListing={openListing} zoneId={zoneId} />
          {selectedListing ? <ListingDrawer key={selectedListing.id.toString()} listing={selectedListing} onClose={closeListing} /> : null}
        </div>
        <p className="demo-footnote">Use WASD or arrow keys to swim. Click a Seller or use Browse Stalls without moving.</p>
      </div>
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">{announcement}</p>
    </main>
  );
}
