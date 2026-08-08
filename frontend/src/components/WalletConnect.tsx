"use client";

import { useEscrow } from "@/hooks/useEscrow";

/** Truncates an address: 0x1234…abcd */
function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { account, usdcBalance, connect, loading } = useEscrow();

  if (account) {
    const usdc = Number(usdcBalance) / 1_000_000;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="usdc-badge">
          💵 ${usdc.toFixed(2)} USDC
        </span>
        <span className="wallet-addr">
          <span className="wallet-dot" />
          {truncate(account)}
        </span>
      </div>
    );
  }

  return (
    <button
      id="btn-connect-wallet"
      className="wallet-btn"
      onClick={connect}
      disabled={loading.connect}
    >
      {loading.connect ? (
        <>
          <span className="spinner" />
          Connecting…
        </>
      ) : (
        <>🦊 Connect Wallet</>
      )}
    </button>
  );
}
