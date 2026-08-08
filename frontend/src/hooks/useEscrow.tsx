"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Address,
  EscrowService,
  Listing,
  Trade,
  TradeEvent,
} from "@shared/escrow";

// ─── Context shape ────────────────────────────────────────────────────────────

interface EscrowCtx {
  service: EscrowService | null;
  account: Address | null;
  usdcBalance: bigint;
  listings: Listing[];
  myTrades: Trade[];
  events: TradeEvent[];

  connect: () => Promise<void>;
  refreshListings: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  refreshBalance: () => Promise<void>;

  loading: {
    connect: boolean;
    listings: boolean;
    trades: boolean;
  };
  error: string | null;
  clearError: () => void;
  isBusy: boolean;
  setIsBusy: (b: boolean) => void;
}

const Ctx = createContext<EscrowCtx | null>(null);

export function useEscrow(): EscrowCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEscrow must be used inside <EscrowProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EscrowProvider({ children }: { children: React.ReactNode }) {
  const [service, setService] = useState<EscrowService | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [loading, setLoading] = useState({ connect: false, listings: false, trades: false });
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Lazy-init service (only in browser; avoids SSR issues with window.ethereum).
  const getOrCreateService = useCallback(async (): Promise<EscrowService> => {
    if (service) return service;
    
    // Check if we are in demo mode
    const useMock = typeof window !== 'undefined' && window.localStorage.getItem('monfish_use_mock') === '1';
    
    if (useMock) {
      const { createMockEscrowService } = await import("@shared/escrow.mock");
      const svc = createMockEscrowService();
      setService(svc);
      return svc;
    }

    const { createChainEscrowService } = await import("@shared/escrow.real");
    const deployments = (await import("@shared/deployments.json")).default as {
      chainId: number;
      rpcUrl: string;
      escrow: Address;
      usdc: Address;
    };
    const svc = createChainEscrowService(deployments);
    setService(svc);
    return svc;
  }, [service]);

  const clearError = useCallback(() => setError(null), []);

  const refreshBalance = useCallback(async () => {
    if (!service || !account) return;
    try {
      const bal = await service.getUsdcBalance(account);
      setUsdcBalance(bal);
    } catch {
      // silently ignore balance refresh errors
    }
  }, [service, account]);

  const refreshListings = useCallback(async () => {
    if (!service) return;
    setLoading((l) => ({ ...l, listings: true }));
    try {
      const list = await service.getListings();
      setListings(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading((l) => ({ ...l, listings: false }));
    }
  }, [service]);

  const refreshTrades = useCallback(async () => {
    if (!service || !account) return;
    setLoading((l) => ({ ...l, trades: true }));
    try {
      const trades = await service.getMyTrades();
      setMyTrades(trades);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading((l) => ({ ...l, trades: false }));
    }
  }, [service, account]);

  const connect = useCallback(async () => {
    setLoading((l) => ({ ...l, connect: true }));
    clearError();
    try {
      const svc = await getOrCreateService();
      const addr = await svc.connectWallet();
      setAccount(addr);

      // fetch listings + balance after connection
      const [list, bal] = await Promise.all([
        svc.getListings(),
        svc.getUsdcBalance(addr),
      ]);
      setListings(list);
      setUsdcBalance(bal);

      // fetch my trades
      const trades = await svc.getMyTrades();
      setMyTrades(trades);

      // subscribe to on-chain events
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = svc.onTradeEvent((ev) => {
        setEvents((prev) => {
          if (prev.some((p) => p.txHash === ev.txHash && p.type === ev.type)) return prev;
          return [ev, ...prev].slice(0, 20);
        });
        // refresh trades + balance on any event for simplicity
        svc.getMyTrades().then(setMyTrades).catch(() => {});
        svc.getUsdcBalance(addr).then(setUsdcBalance).catch(() => {});
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading((l) => ({ ...l, connect: false }));
    }
  }, [getOrCreateService, clearError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        service,
        account,
        usdcBalance,
        listings,
        myTrades,
        events,
        connect,
        refreshListings,
        refreshTrades,
        refreshBalance,
        loading,
        error,
        clearError,
        isBusy,
        setIsBusy,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
