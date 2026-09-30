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
  connectSolanaProvider,
  ensureWalletStandardListeners,
  getActiveSolanaProvider,
  listSolanaInjectedWallets,
  setActiveSolanaProvider,
  waitForSolanaWallets,
  type SolanaInjectedProvider,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";

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
  listWallets: () => SolanaInjectedWallet[];
  /** Wait for late injection then return wallets (for picker). */
  discoverWallets: () => Promise<SolanaInjectedWallet[]>;
  connect: (wallet: SolanaInjectedWallet) => Promise<string>;
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
      "No Solana wallet connected. Click Connect Wallet and choose a wallet.",
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

  useEffect(() => {
    ensureWalletStandardListeners();
    setReady(true);
    const wallets = listSolanaInjectedWallets();
    for (const w of wallets) {
      if (w.provider.publicKey) {
        setActiveSolanaProvider(w.provider);
        setPublicKey(w.provider.publicKey.toString());
        setConnected(true);
        const provider = w.provider;
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
        provider.on?.("disconnect", onDisconnect);
        provider.on?.("accountChanged", onAccountChanged);
        return () => {
          provider.off?.("disconnect", onDisconnect);
          provider.off?.("accountChanged", onAccountChanged);
        };
      }
    }
    return undefined;
  }, []);

  const listWallets = useCallback(() => listSolanaInjectedWallets(), []);
  const discoverWallets = useCallback(() => waitForSolanaWallets(2500), []);

  const connect = useCallback(async (wallet: SolanaInjectedWallet) => {
    setConnecting(true);
    setError(null);
    try {
      // Re-resolve injector at click time (Phantom may attach late on mobile).
      let fresh =
        listSolanaInjectedWallets().find((w) => w.id === wallet.id) ?? wallet;
      if (!fresh.provider?.connect) {
        const waited = await waitForSolanaWallets(5000);
        fresh = waited.find((w) => w.id === wallet.id) ?? waited[0] ?? fresh;
      }
      if (!fresh.provider?.connect) {
        throw new Error(
          "Phantom provider missing connect(). Open this page inside Phantom’s browser, then retry.",
        );
      }
      setActiveSolanaProvider(fresh.provider);
      const pk = await connectSolanaProvider(fresh.provider);
      new PublicKey(pk);
      const live =
        listSolanaInjectedWallets().find((w) => w.id === wallet.id)?.provider ??
        fresh.provider;
      setActiveSolanaProvider(live);
      setPublicKey(pk);
      setConnected(true);
      return pk;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setConnected(false);
      setPublicKey(null);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

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
      if (provider.signTransaction) return provider.signTransaction(tx);
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
      return connection.sendRawTransaction(signed.serialize(), {
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
    discoverWallets,
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
