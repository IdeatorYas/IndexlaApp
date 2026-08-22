"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WalletConnection } from "@/lib/domain/types";

export type DashboardLoadState = "idle" | "loading" | "ready" | "error";

type DemoWalletContextValue = {
  wallet: WalletConnection;
  loadState: DashboardLoadState;
  connectDemo: () => void;
  disconnect: () => void;
  retryLoad: () => void;
  simulateError: () => void;
};

const DemoWalletContext = createContext<DemoWalletContextValue | null>(null);

const DEMO_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function DemoWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnection>({
    state: "disconnected",
    address: null,
    networkId: null,
    shortenedAddress: null,
  });
  const [loadState, setLoadState] = useState<DashboardLoadState>("idle");

  const connectDemo = useCallback(() => {
    setLoadState("loading");
    window.setTimeout(() => {
      setWallet({
        state: "connected",
        address: DEMO_ADDRESS,
        networkId: "ethereum",
        shortenedAddress: shortenAddress(DEMO_ADDRESS),
      });
      setLoadState("ready");
    }, 500);
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      state: "disconnected",
      address: null,
      networkId: null,
      shortenedAddress: null,
    });
    setLoadState("idle");
  }, []);

  const retryLoad = useCallback(() => {
    if (wallet.state !== "connected") {
      connectDemo();
      return;
    }
    setLoadState("loading");
    window.setTimeout(() => setLoadState("ready"), 400);
  }, [connectDemo, wallet.state]);

  const simulateError = useCallback(() => {
    setLoadState("error");
  }, []);

  const value = useMemo(
    () => ({
      wallet,
      loadState,
      connectDemo,
      disconnect,
      retryLoad,
      simulateError,
    }),
    [wallet, loadState, connectDemo, disconnect, retryLoad, simulateError],
  );

  return (
    <DemoWalletContext.Provider value={value}>
      {children}
    </DemoWalletContext.Provider>
  );
}

export function useDemoWallet() {
  const ctx = useContext(DemoWalletContext);
  if (!ctx) {
    throw new Error("useDemoWallet must be used within DemoWalletProvider");
  }
  return ctx;
}
