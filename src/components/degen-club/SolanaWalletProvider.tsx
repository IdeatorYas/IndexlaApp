"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  getActiveSolanaProvider,
  listSolanaInjectedWallets,
  setActiveSolanaProvider,
  type SolanaInjectedProvider,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";

/** Same-origin JSON-RPC proxy — avoids public RPC browser Origin 403. */
function browserSolanaRpcEndpoint(): string {
  if (typeof window === "undefined") return "http://127.0.0.1/api/degen-solana/rpc";
  return `${window.location.origin}/api/degen-solana/rpc`;
}

type SolanaWalletContextValue = {
  ready: boolean;
  connected: boolean;
  publicKey: string | null;
  connecting: boolean;
  error: string | null;
  /** Open picker / connect. If one wallet, connects it; if several, caller should pick. */
  listWallets: () => SolanaInjectedWallet[];
  connect: (wallet?: SolanaInjectedWallet) => Promise<string>;
  disconnect: () => Promise<void>;
  signAllTransactions: (
    txs: VersionedTransaction[],
  ) => Promise<VersionedTransaction[]>;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<string>;
  connection: Connection;
};

const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(
  null,
);

function providerOrThrow(): SolanaInjectedProvider {
  const provider = getActiveSolanaProvider();
  if (!provider) {
    throw new Error(
      "No Solana wallet connected. Click Connect Wallet and choose Phantom, Backpack, or Solflare.",
    );
  }
  return provider;
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection = useMemo(
    () => new Connection(browserSolanaRpcEndpoint(), "confirmed"),
    [],
  );

  const bindProviderEvents = useCallback((provider: SolanaInjectedProvider | null) => {
    if (!provider?.on) return () => undefined;
    const onConnect = () => {
      const p = getActiveSolanaProvider();
      if (p?.publicKey) {
        setPublicKey(p.publicKey.toString());
        setConnected(true);
        setError(null);
      }
    };
    const onDisconnect = () => {
      setPublicKey(null);
      setConnected(false);
    };
    const onAccountChanged = (...args: unknown[]) => {
      const pk = args[0] as { toString(): string } | null | undefined;
      if (pk && typeof pk.toString === "function") {
        setPublicKey(pk.toString());
        setConnected(true);
      } else {
        setPublicKey(null);
        setConnected(false);
      }
    };
    provider.on("connect", onConnect);
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChanged);
    return () => {
      provider.off?.("connect", onConnect);
      provider.off?.("disconnect", onDisconnect);
      provider.off?.("accountChanged", onAccountChanged);
    };
  }, []);

  useEffect(() => {
    setReady(true);
    const wallets = listSolanaInjectedWallets();
    // Restore session if a wallet already authorized this origin.
    for (const w of wallets) {
      if (w.provider.publicKey) {
        setActiveSolanaProvider(w.provider);
        setPublicKey(w.provider.publicKey.toString());
        setConnected(true);
        return bindProviderEvents(w.provider);
      }
    }
    return undefined;
  }, [bindProviderEvents]);

  const listWallets = useCallback(() => listSolanaInjectedWallets(), []);

  const connect = useCallback(async (wallet?: SolanaInjectedWallet) => {
    setConnecting(true);
    setError(null);
    try {
      const wallets = listSolanaInjectedWallets();
      const chosen =
        wallet ??
        (wallets.length === 1 ? wallets[0] : undefined);
      if (!chosen) {
        throw new Error(
          wallets.length === 0
            ? "No Solana wallet found. Install Phantom or Backpack, then retry."
            : "Choose a Solana wallet to continue.",
        );
      }
      setActiveSolanaProvider(chosen.provider);
      bindProviderEvents(chosen.provider);
      const res = await chosen.provider.connect({ onlyIfTrusted: false });
      const pk = res.publicKey.toString();
      new PublicKey(pk);
      setPublicKey(pk);
      setConnected(true);
      return pk;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [bindProviderEvents]);

  const disconnect = useCallback(async () => {
    const provider = getActiveSolanaProvider();
    try {
      await provider?.disconnect?.();
    } finally {
      setActiveSolanaProvider(null);
      setPublicKey(null);
      setConnected(false);
    }
  }, []);

  const signAllTransactions = useCallback(
    async (txs: VersionedTransaction[]) => {
      const provider = providerOrThrow();
      if (!provider.signAllTransactions) {
        throw new Error("Wallet missing signAllTransactions");
      }
      return provider.signAllTransactions(txs);
    },
    [],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction) => {
      const provider = providerOrThrow();
      if (provider.signTransaction) {
        return provider.signTransaction(tx);
      }
      if (provider.signAllTransactions) {
        const [signed] = await provider.signAllTransactions([tx]);
        if (!signed) throw new Error("Wallet returned no signed transaction");
        return signed;
      }
      throw new Error("Wallet missing signTransaction");
    },
    [],
  );

  const signAndSendTransaction = useCallback(
    async (tx: VersionedTransaction) => {
      const provider = providerOrThrow();
      if (provider.signAndSendTransaction) {
        const res = await provider.signAndSendTransaction(tx, {
          skipPreflight: false,
          maxRetries: 0,
        });
        return res.signature;
      }
      if (!provider.signTransaction) {
        throw new Error("Wallet missing signAndSendTransaction / signTransaction");
      }
      const signed = await provider.signTransaction(tx);
      const raw = signed.serialize();
      return connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 3,
      });
    },
    [connection],
  );

  const value: SolanaWalletContextValue = {
    ready,
    connected,
    publicKey,
    connecting,
    error,
    listWallets,
    connect,
    disconnect,
    signAllTransactions,
    signTransaction,
    signAndSendTransaction,
    connection,
  };

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function useSolanaWallet(): SolanaWalletContextValue {
  const ctx = useContext(SolanaWalletContext);
  if (!ctx) {
    throw new Error("useSolanaWallet must be used within SolanaWalletProvider");
  }
  return ctx;
}
