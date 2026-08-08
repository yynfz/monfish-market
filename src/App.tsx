import { useEffect, useRef, useState } from 'react';
import { formatUsdc, ZONES } from '../shared/escrow';
import {
  getListingMetadata,
  LISTINGS,
  type CanonicalListing,
} from './listings';

function formatDeliveryWindow(seconds: number) {
  return seconds === 60 ? '60 seconds' : `${seconds / 3_600} hours`;
}

function ShellIcon({ name }: { name: 'compass' | 'stall' | 'close' | 'bag' }) {
  const paths = {
    compass: <><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7Z" /></>,
    stall: <><path d="M4 10v9h16v-9" /><path d="M3 10h18l-2-5H5l-2 5Z" /><path d="M8 19v-5h5v5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
  };

  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function ListingDrawer({ listing, onClose }: { listing: CanonicalListing; onClose: () => void }) {
  const [draftOpen, setDraftOpen] = useState(false);
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

  return (
    <aside
      aria-label={`${metadata.name} details`}
      aria-modal="false"
      className="listing-drawer"
      role="dialog"
    >
      <div className="drawer-handle" />
      <button aria-label="Close listing details" className="icon-button drawer-close" onClick={onClose} ref={closeButtonRef} type="button">
        <ShellIcon name="close" />
      </button>

      <p className="seller-name">{metadata.sellerName} says</p>
      <blockquote><span>{metadata.dialogue}</span></blockquote>
      <h3>{metadata.name}</h3>
      <p className="listing-id">Listing #{listing.id.toString()}</p>
      <p className="description">{metadata.description}</p>

      <dl className="listing-facts">
        <div>
          <dt>Product price</dt>
          <dd>{formatUsdc(listing.priceUsdc)} MockUSDC</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>Delivery window: {formatDeliveryWindow(listing.deliveryWindowSecs)}</dd>
        </div>
      </dl>

      <details className="artifact-proof">
        <summary>Artifact proof</summary>
        <code>{listing.productHash}</code>
      </details>

      {draftOpen ? (
        <section aria-labelledby="checkout-title" className="checkout-draft">
          <h4 id="checkout-title">Checkout draft</h4>
          <p><strong>{formatUsdc(listing.priceUsdc)} MockUSDC</strong> for {metadata.name}</p>
          <p>No Trade has been created.</p>
          <button className="secondary-action" onClick={() => setDraftOpen(false)} type="button">
            Discard checkout draft
          </button>
        </section>
      ) : (
        <button className="primary-action" onClick={() => setDraftOpen(true)} type="button">
          <ShellIcon name="bag" />
          Open checkout draft
        </button>
      )}
    </aside>
  );
}

function MarketScene({
  zoneId,
  browsing,
  onBrowse,
  onSelectListing,
}: {
  zoneId: number;
  browsing: boolean;
  onBrowse: () => void;
  onSelectListing: (listing: CanonicalListing, trigger: HTMLButtonElement) => void;
}) {
  const zone = ZONES.find((candidate) => candidate.id === zoneId)!;
  const zoneListings = LISTINGS.filter((listing) => listing.zoneId === zoneId);

  return (
    <section aria-label="Market playfield" className={`playfield zone-${zoneId}`}>
      <div aria-hidden="true" className="water-light water-light-one" />
      <div aria-hidden="true" className="water-light water-light-two" />
      <div aria-hidden="true" className="seabed" />
      <div aria-hidden="true" className="scene-landmark">
        <span />
        <span />
        <span />
      </div>

      <div className="zone-copy">
        <h2>{zone.name}</h2>
        <p>{zoneId === 0 ? 'Sunlit workshops in the shallows' : 'Trade lights beneath the old docks'}</p>
      </div>

      {browsing ? (
        <div aria-label={`${zone.name} stalls`} className="stall-row">
          {zoneListings.map((listing) => {
            const metadata = getListingMetadata(listing.id);
            if (!metadata) return null;

            return (
              <button
                aria-label={`${metadata.name}, ${formatUsdc(listing.priceUsdc)} MockUSDC`}
                className="stall"
                key={listing.id.toString()}
                onClick={(event) => onSelectListing(listing, event.currentTarget)}
                type="button"
              >
                <span aria-hidden="true" className="stall-awning"><i /><i /><i /></span>
                <span className="stall-name">{metadata.name}</span>
                <span className="stall-price">{formatUsdc(listing.priceUsdc)} MockUSDC</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button className="browse-action" onClick={onBrowse} type="button">
          <ShellIcon name="stall" />
          Browse Stalls
        </button>
      )}

      <div aria-hidden="true" className="buyer-fish">
        <span className="fish-tail" />
        <span className="fish-body"><i /></span>
      </div>
    </section>
  );
}

export default function App() {
  const [zoneId, setZoneId] = useState<number>(ZONES[0].id);
  const [browsing, setBrowsing] = useState(false);
  const [selectedListing, setSelectedListing] = useState<CanonicalListing | null>(null);
  const listingTriggerRef = useRef<HTMLButtonElement | null>(null);

  function enterZone(nextZoneId: number) {
    setZoneId(nextZoneId);
    setBrowsing(false);
    setSelectedListing(null);
  }

  function openListing(listing: CanonicalListing, trigger: HTMLButtonElement) {
    listingTriggerRef.current = trigger;
    setSelectedListing(listing);
  }

  function closeListing() {
    setSelectedListing(null);
    requestAnimationFrame(() => listingTriggerRef.current?.focus());
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="demo-badge">Demo Mode</span>
          <h1>MonFish-Market</h1>
        </div>
        <p className="token-note">MockUSDC is the product token. MON pays gas only.</p>
      </header>

      <nav aria-label="Choose a Zone" className="zone-picker">
        <ShellIcon name="compass" />
        {ZONES.map((zone) => (
          <button
            aria-current={zone.id === zoneId ? 'page' : undefined}
            className={zone.id === zoneId ? 'active' : undefined}
            key={zone.id}
            onClick={() => enterZone(zone.id)}
            type="button"
          >
            Enter {zone.name}
          </button>
        ))}
      </nav>

      <div className="playfield-shell">
        <MarketScene
          browsing={browsing}
          onBrowse={() => setBrowsing(true)}
          onSelectListing={openListing}
          zoneId={zoneId}
        />
        {selectedListing ? (
          <ListingDrawer key={selectedListing.id.toString()} listing={selectedListing} onClose={closeListing} />
        ) : null}
      </div>

      <p className="demo-footnote">Browsing and checkout drafts stay local in this demo. No Trade or Trade History is created.</p>
    </main>
  );
}
