"use client";

import { useState } from "react";
import type { Trade } from "@shared/escrow";
import { TradeStatus, formatUsdc } from "@shared/escrow";
import { getListingMeta } from "@shared/catalog";
import { useEscrow } from "@/hooks/useEscrow";
import { keccak256 } from "viem";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortHash(hex: string) {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

// ─── Artifact Download + Integrity Verify ────────────────────────────────────

interface ArtifactSectionProps {
  trade: Trade;
  onVerified: () => void;
}

function ArtifactSection({ trade, onVerified }: ArtifactSectionProps) {
  const meta = getListingMeta(trade.listingId);
  const [verifyState, setVerifyState] = useState<
    "idle" | "verifying" | "ok" | "mismatch"
  >("idle");
  const [confirmReady, setConfirmReady] = useState(false);

  if (!meta || trade.status !== TradeStatus.Delivered || !trade.deliveryHash) return null;

  async function handleDownloadAndVerify() {
    if (!meta || !trade.deliveryHash) return;
    setVerifyState("verifying");

    try {
      const res = await fetch(meta.artifactPath);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      const hash = keccak256(new Uint8Array(buf));

      // Must match BOTH the listing productHash (from chain) AND the trade deliveryHash.
      // The UI has productHash in the listing; we check deliveryHash here which the seller committed.
      if (
        hash.toLowerCase() !== trade.deliveryHash.toLowerCase() ||
        hash.toLowerCase() !== meta.artifactKeccak.toLowerCase()
      ) {
        setVerifyState("mismatch");
        return;
      }

      // Integrity ok — trigger download
      const url = URL.createObjectURL(new Blob([buf]));
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.artifactPath.split("/").pop() ?? "artifact.zip";
      a.click();
      URL.revokeObjectURL(url);

      setVerifyState("ok");
      setConfirmReady(true);
      onVerified();
    } catch (e) {
      console.error("Artifact verify error:", e);
      setVerifyState("mismatch");
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div className="info-row">
        <span className="label">Delivery hash</span>
        <span className="value mono">{shortHash(trade.deliveryHash)}</span>
      </div>
      <div className="info-row">
        <span className="label">Expected hash</span>
        <span className="value mono">{shortHash(meta.artifactKeccak)}</span>
      </div>

      {verifyState === "idle" && (
        <button
          id={`btn-download-verify-${trade.id}`}
          className="btn btn-outline btn-sm"
          style={{ marginTop: "0.75rem" }}
          onClick={handleDownloadAndVerify}
        >
          🔍 Download &amp; Verify Integrity
        </button>
      )}

      {verifyState === "verifying" && (
        <div className="alert alert-info" style={{ marginTop: "0.75rem" }}>
          <span className="spinner" /> Downloading and verifying keccak256…
        </div>
      )}

      {verifyState === "ok" && (
        <div className="alert alert-success" style={{ marginTop: "0.75rem" }}>
          ✅ Hash verified — artifact downloaded. You can now confirm receipt.
        </div>
      )}

      {verifyState === "mismatch" && (
        <div className="alert alert-error" style={{ marginTop: "0.75rem" }}>
          ⚠️ Integrity check failed — hash mismatch. Do not confirm receipt.
        </div>
      )}

      {/* Confirm Receipt is only enabled after successful hash verification */}
      <ConfirmReceiptButton
        trade={trade}
        disabled={!confirmReady || verifyState !== "ok"}
      />
    </div>
  );
}

// ─── Confirm Receipt Button ───────────────────────────────────────────────────

function ConfirmReceiptButton({
  trade,
  disabled,
}: {
  trade: Trade;
  disabled: boolean;
}) {
  const { service, refreshTrades, refreshBalance } = useEscrow();
  const [step, setStep] = useState<"idle" | "confirming" | "waiting" | "done" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    if (!service) return;
    setStep("confirming");
    setErr(null);
    try {
      const tx = await service.confirmReceipt(trade.id);
      setTxHash(tx.txHash);
      setStep("waiting");
      await tx.wait();
      setStep("done");
      await Promise.all([refreshTrades(), refreshBalance()]);
    } catch (e) {
      setErr((e as Error).message);
      setStep("error");
    }
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button
        id={`btn-confirm-receipt-${trade.id}`}
        className="btn btn-teal"
        disabled={disabled || step !== "idle"}
        onClick={handleConfirm}
        title={disabled ? "Download and verify the artifact first" : undefined}
      >
        {step === "confirming" ? <><span className="spinner" /> Awaiting wallet…</> :
         step === "waiting"    ? <><span className="spinner" /> Finalising on Monad…</> :
         step === "done"       ? "✅ Receipt confirmed — seller paid!" :
         "✅ Confirm Receipt"}
      </button>

      {txHash && step !== "done" && (
        <a
          className="trade-explorer-link"
          href={`https://testnet.monadscan.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-flex", marginTop: "0.5rem", fontSize: "0.75rem" }}
        >
          🔗 {shortHash(txHash)} ↗
        </a>
      )}

      {step === "done" && (
        <div className="alert alert-success" style={{ marginTop: "0.75rem" }}>
          🎉 Trade #{trade.id.toString()} completed! Seller received{" "}
          {formatUsdc(trade.amountUsdc)} MockUSDC.
        </div>
      )}

      {step === "error" && err && (
        <div className="alert alert-error" style={{ marginTop: "0.5rem" }}>⚠️ {err}</div>
      )}
    </div>
  );
}

// ─── Refund Button (Issue #10) ────────────────────────────────────────────────

function RefundButton({ trade, onUpdated }: { trade: Trade; onUpdated: () => void }) {
  const { service } = useEscrow();
  const [refundStep, setRefundStep] = useState<"idle" | "confirming" | "waiting" | "done" | "error">("idle");
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [prolonged, setProlonged] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleRefund() {
    if (!service) return;
    setRefundStep("confirming");
    setRefundErr(null);
    setProlonged(false);
    
    try {
      const tx = await service.refundExpired(trade.id);
      setTxHash(tx.txHash);
      setRefundStep("waiting");
      
      const timer = setTimeout(() => setProlonged(true), 4000);
      await tx.wait();
      clearTimeout(timer);
      
      setRefundStep("done");
      setTimeout(() => { setRefundStep("idle"); onUpdated(); }, 2000);
    } catch (e) {
      setRefundErr((e as Error).message);
      setRefundStep("error");
      setTimeout(() => setRefundStep("idle"), 4000);
    }
  }

  return (
    <>
      <button
        id={`btn-refund-${trade.id}`}
        className="btn btn-danger btn-sm"
        disabled={refundStep !== "idle"}
        onClick={handleRefund}
      >
        {refundStep === "confirming" ? <><span className="spinner" /> Awaiting wallet…</> :
         refundStep === "waiting"    ? <><span className="spinner" /> Finalising…</> :
         refundStep === "done"       ? "↩️ Refunded!" :
         "↩️ Reclaim Funds"}
      </button>

      {prolonged && refundStep === "waiting" && txHash && (
        <a
          href={`https://testnet.monadscan.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-sm"
          style={{ marginLeft: "8px" }}
        >
          🔍 Check Status
        </a>
      )}

      {refundStep === "error" && refundErr && (
        <div className="alert alert-error" style={{ width: "100%", marginTop: "8px" }}>⚠️ {refundErr}</div>
      )}
    </>
  );
}

// ─── Main TradeCard ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TradeStatus, string> = {
  [TradeStatus.Funded]:    "Funded",
  [TradeStatus.Delivered]: "Delivered",
  [TradeStatus.Completed]: "Completed",
  [TradeStatus.Refunded]:  "Refunded",
};
const STATUS_ICONS: Record<TradeStatus, string> = {
  [TradeStatus.Funded]:    "⏳",
  [TradeStatus.Delivered]: "📦",
  [TradeStatus.Completed]: "✅",
  [TradeStatus.Refunded]:  "↩️",
};
const LISTING_ICONS: Record<number, string> = { 1: "🐠", 2: "👻", 3: "🎩" };

function formatDeadline(unixSecs: number): { label: string; expired: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const remaining = unixSecs - now;
  if (remaining <= 0) return { label: "Deadline passed", expired: true };
  if (remaining < 60) return { label: `${remaining}s left`, expired: false };
  if (remaining < 3600) return { label: `${Math.floor(remaining / 60)}m left`, expired: false };
  return { label: `${Math.floor(remaining / 3600)}h left`, expired: false };
}

interface Props {
  trade: Trade;
  onUpdated: () => void;
}

export function TradeCard({ trade, onUpdated }: Props) {
  const { service } = useEscrow();
  const [artifactVerified, setArtifactVerified] = useState(false);
  const meta = getListingMeta(trade.listingId);
  const statusLabel = STATUS_LABELS[trade.status] ?? "Unknown";
  const statusIcon  = STATUS_ICONS[trade.status]  ?? "❓";
  const icon        = LISTING_ICONS[Number(trade.listingId)] ?? "📦";
  const { label: deadlineLabel, expired } = formatDeadline(trade.deadline);
  const canRefund = expired &&
    trade.status !== TradeStatus.Completed &&
    trade.status !== TradeStatus.Refunded;

  return (
    <div className="trade-card">
      {/* Top row */}
      <div className="trade-card-top">
        <span className="trade-icon">{icon}</span>
        <div className="trade-meta">
          <h3>{meta?.name ?? `Listing #${trade.listingId}`}</h3>
          <div className="trade-id">Trade #{trade.id.toString()}</div>
        </div>
        <span className={`trade-status-badge status-${statusLabel}`}>
          {statusIcon} {statusLabel}
        </span>
      </div>

      {/* Info rows */}
      <div>
        <div className="info-row">
          <span className="label">Amount</span>
          <span className="value">{formatUsdc(trade.amountUsdc)} MockUSDC</span>
        </div>
        <div className="info-row">
          <span className="label">Delivery deadline</span>
          <span className={`value ${expired ? "trade-deadline expired" : "trade-deadline"}`}>
            {expired ? "⚠️" : "🕐"} {deadlineLabel}
          </span>
        </div>
      </div>

      {/* Artifact download + confirm receipt (only when Delivered) */}
      {trade.status === TradeStatus.Delivered && (
        <ArtifactSection
          trade={trade}
          onVerified={() => setArtifactVerified(true)}
        />
      )}

      {/* Reclaim Funds (refund path, belongs to #10 but wired here) */}
      {canRefund && (
        <div className="trade-actions">
          <RefundButton trade={trade} onUpdated={onUpdated} />
        </div>
      )}

      {/* Suppress unused var warning */}
      {artifactVerified && null}
    </div>
  );
}
