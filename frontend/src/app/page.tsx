"use client";

import { useState } from "react";
import type { Listing } from "@shared/escrow";
import { ZONES, formatUsdc } from "@shared/escrow";
import { getListingMeta } from "@shared/catalog";
import { EscrowProvider, useEscrow } from "@/hooks/useEscrow";
import { WalletConnect } from "@/components/WalletConnect";
import { BuyModal } from "@/components/BuyModal";
import { TradeCard } from "@/components/TradeCard";
import { DemoModePanel } from "@/components/DemoModePanel";

// ─── Listing card art styles ──────────────────────────────────────────────────

const ART_CLASS: Record<number, string> = { 1: "reef", 2: "ghost", 3: "captain" };
const LISTING_ICONS: Record<number, string> = { 1: "🐠", 2: "👻", 3: "🎩" };

// ─── Inner app (needs EscrowProvider context) ─────────────────────────────────

function MarketplaceApp() {
  const { account, listings, myTrades, events, connect, refreshTrades, refreshBalance } =
    useEscrow();

  const [activeZone, setActiveZone] = useState<number>(1); // start in Sardine Harbor
  const [buyTarget, setBuyTarget] = useState<Listing | null>(null);

  const zoneListings = listings.filter((l) => l.zoneId === activeZone);

  function windowLabel(secs: number) {
    if (secs < 120) return `${secs}s ⚡ demo refund`;
    if (secs < 7200) return `${Math.floor(secs / 60)}m`;
    return `${Math.floor(secs / 3600)}h`;
  }

  return (
    <div className={`page-shell ${activeZone === 0 ? "theme-coral" : "theme-sardine"}`}>
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="container">
          <div className="navbar-inner">
            <div className="navbar-brand">
              <span className="brand-icon">🐟</span>
              <span>MonFish Market</span>
            </div>
            <div className="navbar-right">
              <WalletConnect />
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="container hero-content">
          <div className="hero-eyebrow">🌊 Monad Testnet · Chain 10143</div>
          <h1>Swim the reefs. Trade through trust.</h1>
          <p>
            Ocean-themed escrow marketplace — buyer and seller fish meet in reef markets,
            fund MockUSDC escrow on-chain, and release payment after confirmed delivery.
          </p>
          {!account && (
            <button
              id="btn-hero-connect"
              className="btn btn-primary"
              style={{ marginTop: "var(--space-2)", fontSize: "1rem", padding: "0.6rem 1.5rem" }}
              onClick={connect}
            >
              🦊 Connect Demo Wallet
            </button>
          )}
          <div className="hero-stats" style={{ marginTop: "var(--space-6)" }}>
            <div className="hero-stat">
              <span className="label">Listings</span>
              <span className="value">{listings.length}</span>
            </div>
            <div className="hero-stat">
              <span className="label">My trades</span>
              <span className="value">{myTrades.length}</span>
            </div>
            <div className="hero-stat">
              <span className="label">Settlement</span>
              <span className="value">&lt; 1 s</span>
            </div>
          </div>
        </div>
      </section>

      <main className="container" style={{ flex: 1, paddingTop: "var(--space-6)" }}>

        {/* ── Demo Mode panel (always visible) ── */}
        <DemoModePanel trades={myTrades} />

        {/* ── Zone tabs ── */}
        <div className="zone-tabs">
          {ZONES.map((z) => (
            <button
              key={z.id}
              id={`btn-zone-${z.id}`}
              className={`zone-tab ${activeZone === z.id ? "active" : ""}`}
              onClick={() => setActiveZone(z.id)}
            >
              {z.id === 0 ? "🪸" : "⚓"} {z.name}
            </button>
          ))}
        </div>

        {/* ── Listings ── */}
        <div className="section-heading">
          <h2>{ZONES.find((z) => z.id === activeZone)?.name ?? "Zone"}</h2>
          <span className="count-badge">{zoneListings.length} listings</span>
        </div>

        {!account ? (
          <div className="empty-state">
            <div className="icon">🐡</div>
            <p>Connect your demo wallet to browse listings and start trading.</p>
          </div>
        ) : zoneListings.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🌊</div>
            <p>No listings in this zone yet.</p>
          </div>
        ) : (
          <div className="listings-grid">
            {zoneListings.map((listing) => {
              const meta = getListingMeta(listing.id);
              const artClass = ART_CLASS[Number(listing.id)] ?? "reef";
              const icon = LISTING_ICONS[Number(listing.id)] ?? "📦";
              const isUrgent = listing.deliveryWindowSecs < 120;
              return (
                <div key={listing.id.toString()} className="listing-card">
                  <div className={`listing-card-art ${artClass}`}>{icon}</div>
                  <div className="listing-card-body">
                    <span className="listing-zone">
                      {listing.zoneId === 0 ? "🪸 Coral Capital" : "⚓ Sardine Harbor"}
                    </span>
                    <div className="listing-name">{meta?.name ?? `Listing #${listing.id}`}</div>
                    <p className="listing-desc">
                      {meta?.description ?? "A digital product secured by on-chain escrow."}
                    </p>
                    <div className="listing-footer">
                      <span className="listing-price">{formatUsdc(listing.priceUsdc)}</span>
                      <span className={`window-badge${isUrgent ? " urgent" : ""}`}>
                        ⏱ {windowLabel(listing.deliveryWindowSecs)}
                      </span>
                      <button
                        id={`btn-buy-${listing.id}`}
                        className="btn btn-primary btn-sm"
                        onClick={() => setBuyTarget(listing)}
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── My Trades ── */}
        {myTrades.length > 0 && (
          <section className="my-trades-section">
            <div className="section-heading">
              <h2>My Purchases</h2>
              <span className="count-badge">{myTrades.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {myTrades.map((trade) => (
                <TradeCard
                  key={trade.id.toString()}
                  trade={trade}
                  onUpdated={() => { void refreshTrades(); void refreshBalance(); }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Event Feed (messages in bottles) ── */}
        {events.length > 0 && (
          <section className="feed-section" aria-live="polite">
            <div className="feed-title">🍾 Messages in Bottles — on-chain events</div>
            <div className="feed-list">
              {events.map((ev, i) => (
                <div key={i} className="feed-item">
                  <span className="event-icon">
                    {ev.type === "Funded"    ? "⏳" :
                     ev.type === "Delivered" ? "📦" :
                     ev.type === "Completed" ? "✅" : "↩️"}
                  </span>
                  <span className="event-text">
                    Trade #{ev.tradeId.toString()} — <strong>{ev.type}</strong>
                  </span>
                  <a
                    className="event-hash"
                    href={`https://testnet.monadscan.com/tx/${ev.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ev.txHash.slice(0, 10)}…
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <span>🐟 MonFish Market · Monad Testnet · MockUSDC (testnet only)</span>
            <div className="footer-links">
              <a href="https://testnet.monadscan.com" target="_blank" rel="noreferrer">Explorer ↗</a>
              <a href="https://github.com/yynfz/monfish-market" target="_blank" rel="noreferrer">GitHub ↗</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Buy Modal ── */}
      {buyTarget && (
        <BuyModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onPurchased={() => {
            setBuyTarget(null);
            void refreshTrades();
            void refreshBalance();
          }}
        />
      )}
    </div>
  );
}

// ─── Page root (wraps with EscrowProvider) ────────────────────────────────────

export default function HomePage() {
  return (
    <EscrowProvider>
      <MarketplaceApp />
    </EscrowProvider>
  );
}
