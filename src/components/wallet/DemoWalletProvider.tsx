"use client";

/**
 * App-wide wallet state backed by Reown AppKit + wagmi.
 * Replaces the former demo/fake wallet path. No connectDemo / fake addresses.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAppKit } from "@reown/appkit/react";
import {
  useAccount,
  useBalance,
  useChainId,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { formatEther } from "viem";
import type { NetworkId, WalletConnection } from "@/lib/domain/types";
import { STABLE_CLUB_CHAIN_ID } from "@/lib/stable-club/constants";
import { hasWalletConnectProjectId } from "@/lib/wallet/wagmi-config";

export type DashboardLoadState = "idle" | "loading" | "ready" | "error";

type AppWalletContextValue = {
  wallet: WalletConnection;
  loadState: DashboardLoadState;
  /** Opens Reown AppKit connect modal. */
  connect: () => void;
  disconnect: () => void;
  switchToBase: () => Promise<void>;
  ethBalanceFormatted: string | null;
  chainId: number | null;
  walletError: string | null;
  retryLoad: () => void;
  simulateError: () => void;
};

const AppWalletContext = createContext<AppWalletContextValue | null>(null);

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function networkIdFromChainId(chainId: number | undefined): NetworkId | null {
  if (chainId === 8453) return "base";
  if (chainId === 1) return "ethereum";
  if (chainId === 42161) return "arbitrum";
  if (chainId === 56) return "bnb";
  return null;
}

export function AppWalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: ethBalance } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  const walletError = !hasWalletConnectProjectId()
    ? "Wallet connection is unavailable until NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is configured."
    : null;

  const wallet: WalletConnection = useMemo(() => {
    if (!isConnected || !address) {
      return {
        state: isConnecting || isReconnecting ? "reconnect" : "disconnected",
        address: null,
        networkId: null,
        shortenedAddress: null,
      };
    }
    const onBase = chainId === STABLE_CLUB_CHAIN_ID;
    return {
      state: onBase ? "connected" : "wrong-network",
      address,
      networkId: networkIdFromChainId(chainId),
      shortenedAddress: shortenAddress(address),
    };
  }, [address, chainId, isConnected, isConnecting, isReconnecting]);

  const loadState: DashboardLoadState = isConnecting
    ? "loading"
    : isConnected
      ? "ready"
      : "idle";

  const connect = useCallback(() => {
    if (!hasWalletConnectProjectId()) return;
    void open({ view: "Connect" });
  }, [open]);

  const disconnect = useCallback(() => {
    void disconnectAsync().catch(() => {
      /* user rejection / already disconnected */
    });
  }, [disconnectAsync]);

  const switchToBase = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: STABLE_CLUB_CHAIN_ID });
    } catch {
      /* user rejection or wallet missing Base — surfaced via wrong-network state */
    }
  }, [switchChainAsync]);

  const ethBalanceFormatted = ethBalance
    ? `${Number(formatEther(ethBalance.value)).toFixed(4)} ${ethBalance.symbol}`
    : null;

  const value = useMemo(
    () => ({
      wallet,
      loadState,
      connect,
      disconnect,
      switchToBase,
      ethBalanceFormatted,
      chainId: chainId ?? null,
      walletError,
      retryLoad: connect,
      simulateError: () => {
        /* no-op in production wallet path */
      },
    }),
    [
      wallet,
      loadState,
      connect,
      disconnect,
      switchToBase,
      ethBalanceFormatted,
      chainId,
      walletError,
    ],
  );

  return <AppWalletContext.Provider value={value}>{children}</AppWalletContext.Provider>;
}

/** Primary app wallet hook (real wagmi/Reown state). */
export function useAppWallet(): AppWalletContextValue {
  const ctx = useContext(AppWalletContext);
  if (!ctx) {
    throw new Error("useAppWallet must be used within AppWalletProvider");
  }
  return ctx;
}

/**
 * @deprecated Use useAppWallet. Kept as a compatibility alias during migration
 * so existing screens receive real wallet state.
 */
export function useDemoWallet(): AppWalletContextValue {
  return useAppWallet();
}

/** @deprecated Use AppWalletProvider */
export const DemoWalletProvider = AppWalletProvider;
