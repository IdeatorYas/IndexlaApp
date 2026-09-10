"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAppKit } from "@reown/appkit/react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import type { Address, Chain, EIP1193Provider } from "viem";
import {
  STABLE_CLUB_CHAIN,
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_LOCAL_CHAIN,
} from "@/lib/stable-club/constants";
import { hasWalletConnectProjectId } from "@/lib/wallet/wagmi-config";

type StableClubWalletState = {
  status: "disconnected" | "connecting" | "connected" | "wrong-network";
  address: Address | null;
  chainId: number | null;
  error: string | null;
};

type StableClubWalletContextValue = StableClubWalletState & {
  provider: EIP1193Provider | null;
  chain: Chain;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToBase: () => Promise<void>;
  switchToLocalHardhat: () => Promise<void>;
};

const StableClubWalletContext = createContext<StableClubWalletContextValue | null>(
  null,
);

export function StableClubWalletProvider({
  children,
  preferLocalHardhat = false,
}: {
  children: React.ReactNode;
  preferLocalHardhat?: boolean;
}) {
  const { open } = useAppKit();
  const { address, isConnected, isConnecting, isReconnecting, connector } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const expectedChainId = preferLocalHardhat
    ? STABLE_CLUB_LOCAL_CHAIN.id
    : STABLE_CLUB_CHAIN_ID;
  const chain = preferLocalHardhat ? STABLE_CLUB_LOCAL_CHAIN : STABLE_CLUB_CHAIN;

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

  /**
   * Auto-reconnect injected wallets (MetaMask / Playwright inject) when the site
   * already has eth_accounts authorized — required for My Position discovery.
   */
  useEffect(() => {
    if (preferLocalHardhat || isConnected || isConnecting || isReconnecting) return;
    let cancelled = false;
    (async () => {
      try {
        const eth = (
          typeof window !== "undefined"
            ? (window as Window & { ethereum?: EIP1193Provider }).ethereum
            : undefined
        );
        if (!eth?.request) return;
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        if (cancelled || !accounts?.[0]) return;
        const injected =
          connectors.find((c) => c.type === "injected") ??
          connectors.find((c) => c.id === "injected" || /injected|metaMask/i.test(c.name));
        if (!injected) return;
        await connectAsync({ connector: injected, chainId: expectedChainId });
      } catch {
        // Manual Connect Wallet remains available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    preferLocalHardhat,
    isConnected,
    isConnecting,
    isReconnecting,
    connectors,
    connectAsync,
    expectedChainId,
  ]);

  const status: StableClubWalletState["status"] = !isConnected
    ? isConnecting || isReconnecting
      ? "connecting"
      : "disconnected"
    : chainId === expectedChainId
      ? "connected"
      : "wrong-network";

  const connect = useCallback(async () => {
    setLocalError(null);
    if (!hasWalletConnectProjectId()) {
      setLocalError(
        "WalletConnect project ID is missing. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to connect.",
      );
      return;
    }
    try {
      await open({ view: "Connect" });
    } catch (err) {
      const message =
        err instanceof Error && /reject|denied|cancel/i.test(err.message)
          ? "Connection rejected."
          : "Unable to open wallet modal.";
      setLocalError(message);
    }
  }, [open]);

  const disconnect = useCallback(() => {
    setLocalError(null);
    void disconnectAsync().catch(() => undefined);
  }, [disconnectAsync]);

  const switchToBase = useCallback(async () => {
    setLocalError(null);
    try {
      await switchChainAsync({ chainId: STABLE_CLUB_CHAIN_ID });
    } catch (err) {
      const message =
        err instanceof Error && /reject|denied|cancel/i.test(err.message)
          ? "Network switch rejected."
          : "Unable to switch to Base.";
      setLocalError(message);
    }
  }, [switchChainAsync]);

  const switchToLocalHardhat = useCallback(async () => {
    setLocalError(null);
    if (!provider?.request) {
      setLocalError("No wallet provider for local Hardhat switch.");
      return;
    }
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${STABLE_CLUB_LOCAL_CHAIN.id.toString(16)}` }],
      });
    } catch {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${STABLE_CLUB_LOCAL_CHAIN.id.toString(16)}`,
              chainName: STABLE_CLUB_LOCAL_CHAIN.name,
              nativeCurrency: STABLE_CLUB_LOCAL_CHAIN.nativeCurrency,
              rpcUrls: [...STABLE_CLUB_LOCAL_CHAIN.rpcUrls.default.http],
            },
          ],
        });
      } catch (err) {
        const message =
          err instanceof Error && /reject|denied|cancel/i.test(err.message)
            ? "Network switch rejected."
            : "Unable to switch to local Hardhat.";
        setLocalError(message);
      }
    }
  }, [provider]);

  const value = useMemo<StableClubWalletContextValue>(
    () => ({
      status,
      address: (address as Address | undefined) ?? null,
      chainId: chainId ?? null,
      error: localError,
      provider,
      chain,
      connect,
      disconnect,
      switchToBase,
      switchToLocalHardhat,
    }),
    [
      status,
      address,
      chainId,
      localError,
      provider,
      chain,
      connect,
      disconnect,
      switchToBase,
      switchToLocalHardhat,
    ],
  );

  return (
    <StableClubWalletContext.Provider value={value}>{children}</StableClubWalletContext.Provider>
  );
}

export function useStableClubWallet(): StableClubWalletContextValue {
  const ctx = useContext(StableClubWalletContext);
  if (!ctx) {
    throw new Error("useStableClubWallet must be used within StableClubWalletProvider");
  }
  return ctx;
}
