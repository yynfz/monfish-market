"use client";

import { useState } from "react";
import type { Trade } from "@shared/escrow";
import { TradeStatus, formatUsdc } from "@shared/escrow";
import { getListingMeta } from "@shared/catalog";
import { useEscrow } from "@/hooks/useEscrow";

/**
 * Demo Mode panel — always visible, visibly labeled.
 * "Mark Delivered" advances the selected Funded trade to Delivered via the
 * canonical EscrowService (same path as the real seller script).
 */
export function DemoModePanel({ trades }: { trades: Trade[] }) {
  const { service, refreshTrades, refreshBalance } = useEscrow();
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<string | null>(null);

  // Only Funded trades can be marked delivered.
  const fundedTrades = trades.filter((t) => t.status === TradeStatus.Funded);

  async function markDelivered(trade: Trade) {
    if (!service) return;
    setBusy(true);
    setLastMsg(null);
    try {
      // Delivery hash = the artifact keccak (same as the real deliver.sh script uses).
      const meta = getListingMeta(trade.listingId);
      const deliveryHash = meta?.artifactKeccak ?? ("0x" + "00".repeat(32)) as `0x${string}`;
      const tx = await service.markDelivered(trade.id, deliveryHash);
      setLastMsg(`⏳ Finalising delivery for Trade #${trade.id}…`);
      await tx.wait();
      setLastMsg(`📦 Trade #${trade.id} marked Delivered! Buyer can now download & confirm.`);
      await refreshTrades();
    } catch (e) {
      setLastMsg(`⚠️ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Demo Mode panel"
      style={{
        background: "var(--color-gold-lt)",
        border: "2px solid var(--color-gold)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4) var(--space-5)",
        marginBottom: "var(--space-6)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <span style={{ fontSize: "1.1rem" }}>🧪</span>
        <strong style={{ color: "#7A5010", fontSize: "0.88rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Demo Mode — Mock Data
        </strong>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={async () => {
            if (typeof (service as any)?.__demoReset === "function") {
              setBusy(true);
              (service as any).__demoReset();
              await Promise.all([refreshTrades(), refreshBalance()]);
              setBusy(false);
              setLastMsg("🔄 Demo state reset to initial values.");
            }
          }}
        >
          Reset Demo
        </button>
      </div>

      <p style={{ fontSize: "0.82rem", color: "#7A5010", marginBottom: "var(--space-3)" }}>
        Playing the seller role: click <em>Mark Delivered</em> to advance a Funded trade.
        In the live demo this is done by <code>scripts/deliver.sh</code>.
      </p>

      {fundedTrades.length === 0 ? (
        <p style={{ fontSize: "0.82rem", color: "#7A5010", opacity: 0.7 }}>
          No Funded trades yet — buy a listing to see the button appear here.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {fundedTrades.map((trade) => {
            const meta = getListingMeta(trade.listingId);
            const expired = Math.floor(Date.now() / 1000) > trade.deadline;
            return (
              <div key={trade.id.toString()} style={{ display: "flex", gap: "4px" }}>
                <button
                  id={`btn-demo-deliver-${trade.id}`}
                  className="btn btn-sm"
                  style={{ background: "var(--color-gold)", color: "white", border: "none" }}
                  disabled={busy}
                  onClick={() => markDelivered(trade)}
                >
                  📦 Mark Delivered — {meta?.name ?? `Trade #${trade.id}`} ({formatUsdc(trade.amountUsdc)})
                </button>
                {!expired && (
                  <button
                    className="btn btn-sm"
                    style={{ background: "var(--color-ink-mid)", color: "white", border: "none" }}
                    disabled={busy}
                    onClick={() => {
                      if (typeof (service as any)?.__demoExpireTrade === "function") {
                        (service as any).__demoExpireTrade(trade.id);
                        void refreshTrades();
                      }
                    }}
                  >
                    ⏱ Expire
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lastMsg && (
        <p style={{ fontSize: "0.82rem", color: "#7A5010", marginTop: "var(--space-3)" }}>
          {lastMsg}
        </p>
      )}
    </div>
  );
}
