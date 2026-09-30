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

type PhantomLike = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
  signAllTransactions: <T extends VersionedTransaction>(
    txs: T[],
  ) => Promise<T[]>;
  signTransaction?: <T extends VersionedTransaction>(tx: T) => Promise<T>;
  signAndSendTransaction?: (
    tx: VersionedTransaction,
    opts?: { skipPreflight?: boolean; maxRetries?: number },
  ) => Promise<{ signature: string }>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getInjectedSolana(): PhantomLike | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    solana?: PhantomLike;
    phantom?: { solana?: PhantomLike };
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

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
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  signAllTransactions: (
    txs: VersionedTransaction[],
  ) => Promise<VersionedTransaction[]>;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  signAndSendTransaction: (
    tx: VersionedTransaction,
  ) => Promise<string>;
  connection: Connection;
};

const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(
  null,
);

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
    setReady(true);
    const provider = getInjectedSolana();
    if (provider?.publicKey) {
      setPublicKey(provider.publicKey.toString());
      setConnected(true);
    }
    const onConnect = () => {
      const p = getInjectedSolana();
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
    provider?.on?.("connect", onConnect);
    provider?.on?.("disconnect", onDisconnect);
    provider?.on?.("accountChanged", onAccountChanged);
    return () => {
      provider?.off?.("connect", onConnect);
      provider?.off?.("disconnect", onDisconnect);
      provider?.off?.("accountChanged", onAccountChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const provider = getInjectedSolana();
      if (!provider) {
        throw new Error(
          "No Solana wallet found. Install Phantom or Backpack (Solana), then retry.",
        );
      }
      if (
        typeof provider.signAllTransactions !== "function" &&
        typeof provider.signAndSendTransaction !== "function" &&
        typeof provider.signTransaction !== "function"
      ) {
        throw new Error(
          "Wallet must support signing (Phantom/Backpack).",
        );
      }
      const res = await provider.connect();
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
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getInjectedSolana();
    try {
      await provider?.disconnect?.();
    } finally {
      setPublicKey(null);
      setConnected(false);
    }
  }, []);

  const signAllTransactions = useCallback(
    async (txs: VersionedTransaction[]) => {
      const provider = getInjectedSolana();
      if (!provider?.signAllTransactions) {
        throw new Error("Wallet missing signAllTransactions");
      }
      return provider.signAllTransactions(txs);
    },
    [],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction) => {
      const provider = getInjectedSolana();
      if (provider?.signTransaction) {
        return provider.signTransaction(tx);
      }
      // Fallback: some wallets only expose signAllTransactions
      if (provider?.signAllTransactions) {
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
      const provider = getInjectedSolana();
      if (provider?.signAndSendTransaction) {
        const res = await provider.signAndSendTransaction(tx, {
          skipPreflight: false,
          // App confirms via HTTP; avoid Phantom rebroadcast storms that look hostile to Blowfish.
          maxRetries: 0,
        });
        return res.signature;
      }
      if (!provider?.signTransaction) {
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
