"use client";

import { useState } from "react";
import type { Listing } from "@shared/escrow";
import { formatUsdc } from "@shared/escrow";
import { getListingMeta } from "@shared/catalog";
import { useEscrow } from "@/hooks/useEscrow";

interface Props {
  listing: Listing;
  onClose: () => void;
  onPurchased: () => void;
}

type Stage =
  | "idle"
  | "approving"
  | "approved"
  | "funding"
  | "funded"
  | "waiting"
  | "done"
  | "error";

const ZONE_NAMES: Record<number, string> = { 0: "Coral Capital", 1: "Sardine Harbor" };
const LISTING_ICONS: Record<number, string> = { 1: "🐠", 2: "👻", 3: "🎩" };

function shortHash(hex: string) {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

export function BuyModal({ listing, onClose, onPurchased }: Props) {
  const { service, isBusy: globalBusy, setIsBusy, refreshTrades } = useEscrow();
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [prolonged, setProlonged] = useState(false);
  const [tradeId, setTradeId] = useState<bigint | null>(null);

  const meta = getListingMeta(listing.id);
  const icon = LISTING_ICONS[Number(listing.id)] ?? "📦";
  const windowLabel =
    listing.deliveryWindowSecs < 120
      ? `${listing.deliveryWindowSecs}s (demo refund!)`
      : listing.deliveryWindowSecs < 7200
      ? `${Math.floor(listing.deliveryWindowSecs / 60)}m`
      : `${Math.floor(listing.deliveryWindowSecs / 3600)}h`;

  const isUrgent = listing.deliveryWindowSecs < 120;

  const stepState = (s: Stage) => {
    if (stage === s) return "active";
    const order: Stage[] = ["idle", "approving", "approved", "funding", "funded", "waiting", "done"];
    if (order.indexOf(stage) > order.indexOf(s)) return "done";
    return "";
  };

  async function handleApprove() {
    if (!service || globalBusy) return;
    setErr(null);
    setIsRetryable(false);
    setStage("approving");
    setIsBusy(true);
    try {
      const tx = await service.approveUsdc(listing.priceUsdc);
      setTxHash(tx.txHash);
      await tx.wait();
      setTxHash(null);
      setStage("approved");
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      setIsRetryable(msg.toLowerCase().includes("rejected"));
      setStage("error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFund() {
    if (!service || globalBusy) return;
    setErr(null);
    setIsRetryable(false);
    setProlonged(false);
    setStage("funding");
    setIsBusy(true);
    try {
      const { tradeId: tid, tx } = await service.fundTrade(listing.id);
      setTxHash(tx.txHash);
      setTradeId(tid);
      setStage("waiting");
      const timer = setTimeout(() => setProlonged(true), 4000);
      await tx.wait();
      clearTimeout(timer);
      setStage("done");
      onPurchased();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      setIsRetryable(msg.toLowerCase().includes("rejected"));
      setStage("error");
    } finally {
      setIsBusy(false);
    }
  }

  const isLocalBusy = ["approving", "funding", "waiting"].includes(stage);
  const disableButtons = globalBusy || isLocalBusy;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="buy-modal-title">
        {/* Header */}
        <div className="modal-header">
          <h3 id="buy-modal-title">
            {icon} {meta?.name ?? `Listing #${listing.id}`}
          </h3>
          <button className="modal-close" onClick={onClose} disabled={isLocalBusy} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Step progress */}
          <div className="steps">
            <div className={`step-dot ${stepState("approving")}`}>
              <span className="step-num">1</span>
              Approve {formatUsdc(listing.priceUsdc)}
            </div>
            <span className="step-sep">›</span>
            <div className={`step-dot ${stepState("funding")}`}>
              <span className="step-num">2</span>
              Deposit to escrow
            </div>
          </div>

          {/* Listing details */}
          <div>
            <div className="info-row">
              <span className="label">Zone</span>
              <span className="value">{ZONE_NAMES[listing.zoneId] ?? `Zone ${listing.zoneId}`}</span>
            </div>
            <div className="info-row">
              <span className="label">Price</span>
              <span className="value">{formatUsdc(listing.priceUsdc)} USDC</span>
            </div>
            <div className="info-row">
              <span className="label">Delivery window</span>
              <span className={`value ${isUrgent ? "window-badge urgent" : ""}`}>{windowLabel}</span>
            </div>
            <div className="info-row">
              <span className="label">Contract</span>
              <span className="value mono">
                {shortHash(listing.seller)}
              </span>
            </div>
          </div>

          {/* Info alert */}
          {stage === "idle" && (
            <div className="alert alert-info" role="status">
              💡 Two MetaMask popups: first to approve the exact USDC amount, then to lock it in escrow. Download unlocks when the seller marks delivery.
            </div>
          )}

          {stage === "approved" && (
            <div className="alert alert-success" role="status">
              ✅ USDC approved! Now deposit {formatUsdc(listing.priceUsdc)} into escrow.
            </div>
          )}

          {stage === "done" && tradeId !== null && (
            <div className="alert alert-success" role="status">
              🎉 Trade #{tradeId.toString()} funded and live on Monad!
            </div>
          )}

          {stage === "error" && err && (
            <div className="alert alert-error" role="alert">
              ⚠️ {err}
              {!isRetryable && <div style={{ marginTop: "8px", fontSize: "0.85em" }}>Please refresh or contact support. Blind resubmission is disabled for this error.</div>}
            </div>
          )}

          {prolonged && stage === "waiting" && (
            <div className="alert alert-info" role="status" style={{ marginTop: "1rem" }}>
              ⏳ Taking longer than expected...
              <button
                className="btn btn-outline btn-sm"
                style={{ marginLeft: "1rem" }}
                onClick={() => { refreshTrades(); onClose(); }}
              >
                Check Status
              </button>
            </div>
          )}

          {txHash && (
            <a
              className="trade-explorer-link"
              style={{ display: "inline-flex", marginTop: "0.75rem", fontSize: "0.78rem" }}
              href={`https://testnet.monadscan.com/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              🔗 {shortHash(txHash)} ↗
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={isLocalBusy}>
            Cancel
          </button>

          {(stage === "idle" || (stage === "error" && isRetryable && !tradeId)) && (
            <button id="btn-step1-approve" className="btn btn-primary" onClick={handleApprove} disabled={globalBusy && !isLocalBusy}>
              {stage === "error" ? "Retry Step 1 — Approve" : `Step 1 — Approve ${formatUsdc(listing.priceUsdc)}`}
            </button>
          )}

          {stage === "approving" && (
            <button className="btn btn-primary" disabled>
              <span className="spinner" /> Awaiting wallet…
            </button>
          )}

          {(stage === "approved" || (stage === "error" && isRetryable && tradeId !== null)) && (
            <button id="btn-step2-fund" className="btn btn-teal" onClick={handleFund} disabled={globalBusy && !isLocalBusy}>
              {stage === "error" ? "Retry Step 2 — Deposit" : "Step 2 — Deposit to escrow"}
            </button>
          )}

          {stage === "funding" && (
            <button className="btn btn-teal" disabled>
              <span className="spinner" /> Funding trade…
            </button>
          )}

          {stage === "waiting" && (
            <button className="btn btn-teal" disabled>
              <span className="spinner" /> Finalising on Monad…
            </button>
          )}

          {(stage === "done" || (stage === "error" && !isRetryable)) && (
            <button className="btn btn-outline" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
