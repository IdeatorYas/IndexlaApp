"use client";

/**
 * App-wide wallet state backed by Reown AppKit + wagmi.
 * Connect works on any supported chain; Base switch is only for Stable Club actions.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
import { formatEther, type EIP1193Provider } from "viem";
import type { NetworkId, WalletConnection } from "@/lib/domain/types";
import { STABLE_CLUB_CHAIN_ID } from "@/lib/stable-club/constants";
import { hasWalletConnectProjectId } from "@/lib/wallet/wagmi-config";
import {
  chainLabel,
  readProviderChainId,
} from "@/lib/wallet/provider-chain";

export type DashboardLoadState = "idle" | "loading" | "ready" | "error";

type AppWalletContextValue = {
  wallet: WalletConnection;
  loadState: DashboardLoadState;
  /** Opens Reown AppKit connect modal. Does not force a network switch. */
  connect: () => void;
  disconnect: () => void;
  /** Request Base only when a Stable Club action needs it. */
  switchToBase: () => Promise<void>;
  ethBalanceFormatted: string | null;
  /** Live EIP-1193 chain when available; falls back to wagmi. */
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
  if (chainId === 4663) return "ethereum"; // closest NetworkId; RH not in enum
  return null;
}

export function AppWalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { address, isConnected, isConnecting, isReconnecting, connector } =
    useAccount();
  const wagmiChainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [liveChainId, setLiveChainId] = useState<number | null>(null);

  const { data: ethBalance } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!connector) {
        if (!cancelled) setProvider(null);
        return;
      }
      try {
        const p = (await connector.getProvider()) as EIP1193Provider;
        if (!cancelled) setProvider(p);
      } catch {
        if (!cancelled) setProvider(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connector]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const fromProvider = await readProviderChainId(provider);
      if (cancelled) return;
      setLiveChainId(fromProvider ?? wagmiChainId ?? null);
    };
    void sync();
    if (!provider || typeof provider.on !== "function") {
      return () => {
        cancelled = true;
      };
    }
    const onChainChanged = (hex: string) => {
      const n = Number.parseInt(hex, 16);
      if (Number.isFinite(n)) setLiveChainId(n);
    };
    const onAccountsChanged = () => {
      void sync();
    };
    provider.on("chainChanged", onChainChanged);
    provider.on("accountsChanged", onAccountsChanged);
    return () => {
      cancelled = true;
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [provider, wagmiChainId]);

  const chainId = liveChainId ?? wagmiChainId ?? null;

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
    // App-wide: connected on any chain. Product surfaces request switches on action.
    return {
      state: "connected",
      address,
      networkId: networkIdFromChainId(chainId ?? undefined),
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
    const live = await readProviderChainId(provider);
    if (live === STABLE_CLUB_CHAIN_ID) {
      setLiveChainId(STABLE_CLUB_CHAIN_ID);
      return;
    }
    try {
      await switchChainAsync({ chainId: STABLE_CLUB_CHAIN_ID });
      const confirmed = await readProviderChainId(provider);
      if (confirmed != null) setLiveChainId(confirmed);
    } catch {
      /* user rejection or wallet missing Base — caller surfaces */
    }
  }, [provider, switchChainAsync]);

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
      chainId,
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

  return (
    <AppWalletContext.Provider value={value}>{children}</AppWalletContext.Provider>
  );
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

export { chainLabel };
