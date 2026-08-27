"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createPublicClient,
  custom,
  type Address,
  type Chain,
  type EIP1193Provider,
} from "viem";
import {
  STABLE_CLUB_CHAIN,
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";

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

function ethereumProvider(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EIP1193Provider }).ethereum;
}

export function StableClubWalletProvider({
  children,
  preferLocalHardhat = false,
}: {
  children: React.ReactNode;
  preferLocalHardhat?: boolean;
}) {
  const [state, setState] = useState<StableClubWalletState>({
    status: "disconnected",
    address: null,
    chainId: null,
    error: null,
  });
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);

  const expectedChainId = preferLocalHardhat
    ? STABLE_CLUB_LOCAL_CHAIN.id
    : STABLE_CLUB_CHAIN_ID;

  const chain = preferLocalHardhat ? STABLE_CLUB_LOCAL_CHAIN : STABLE_CLUB_CHAIN;

  const refresh = useCallback(async () => {
    const eth = ethereumProvider();
    if (!eth) {
      setProvider(null);
      return;
    }

    setProvider(eth);

    try {
      const client = createPublicClient({
        chain,
        transport: custom(eth),
      });
      const accounts = (await eth.request({
        method: "eth_accounts",
      })) as Address[];
      const chainId = await client.getChainId();

      if (!accounts.length) {
        setState({
          status: "disconnected",
          address: null,
          chainId: null,
          error: null,
        });
        return;
      }

      setState({
        status: chainId === expectedChainId ? "connected" : "wrong-network",
        address: accounts[0] ?? null,
        chainId,
        error: null,
      });
    } catch {
      setState({
        status: "disconnected",
        address: null,
        chainId: null,
        error: null,
      });
    }
  }, [chain, expectedChainId]);

  useEffect(() => {
    const eth = ethereumProvider();
    if (!eth?.on) return;

    const onAccounts = () => {
      void refresh();
    };
    const onChain = () => {
      void refresh();
    };

    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    void refresh();

    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    const eth = ethereumProvider();
    if (!eth) {
      setState((prev) => ({
        ...prev,
        error: "No EVM wallet detected in this browser.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: "connecting", error: null }));
    try {
      await eth.request({ method: "eth_requestAccounts" });
      setProvider(eth);
      await refresh();
    } catch {
      setState({
        status: "disconnected",
        address: null,
        chainId: null,
        error: "Wallet connection was rejected.",
      });
    }
  }, [refresh]);

  const disconnect = useCallback(() => {
    setProvider(null);
    setState({
      status: "disconnected",
      address: null,
      chainId: null,
      error: null,
    });
  }, []);

  const switchChain = useCallback(
    async (targetChain: Chain) => {
      const eth = ethereumProvider();
      if (!eth) return;

      const chainIdHex = `0x${targetChain.id.toString(16)}`;
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
        await refresh();
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainIdHex,
                chainName: targetChain.name,
                nativeCurrency: targetChain.nativeCurrency,
                rpcUrls: targetChain.rpcUrls.default.http,
              },
            ],
          });
          await refresh();
          return;
        }
        setState((prev) => ({
          ...prev,
          error: `Unable to switch wallet to ${targetChain.name}.`,
        }));
      }
    },
    [refresh],
  );

  const switchToBase = useCallback(async () => {
    await switchChain(STABLE_CLUB_CHAIN);
  }, [switchChain]);

  const switchToLocalHardhat = useCallback(async () => {
    await switchChain(STABLE_CLUB_LOCAL_CHAIN);
  }, [switchChain]);

  const value = useMemo(
    () => ({
      ...state,
      provider,
      chain,
      connect,
      disconnect,
      switchToBase,
      switchToLocalHardhat,
    }),
    [
      state,
      provider,
      chain,
      connect,
      disconnect,
      switchToBase,
      switchToLocalHardhat,
    ],
  );

  return (
    <StableClubWalletContext.Provider value={value}>
      {children}
    </StableClubWalletContext.Provider>
  );
}

export function useStableClubWallet() {
  const ctx = useContext(StableClubWalletContext);
  if (!ctx) {
    throw new Error("useStableClubWallet must be used within StableClubWalletProvider");
  }
  return ctx;
}

/** Test-only injected wallet for Playwright E2E (Hardhat account). */
export function injectStableClubTestWallet(testProvider: EIP1193Provider) {
  if (typeof window === "undefined") return;
  (window as Window & { ethereum?: EIP1193Provider }).ethereum = testProvider;
}

export { STABLE_CLUB_LOCAL_RPC_URL };
