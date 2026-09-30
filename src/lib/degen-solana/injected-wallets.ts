"use client";

/**
 * Lightweight injected Solana wallet discovery + connect modal.
 * Shared by AppHeader and SolanaMemeBasketPanel so both use the same session.
 */

export type SolanaInjectedWallet = {
  id: string;
  name: string;
  provider: SolanaInjectedProvider;
};

export type SolanaInjectedProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
  signAllTransactions?: <T>(txs: T[]) => Promise<T[]>;
  signTransaction?: <T>(tx: T) => Promise<T>;
  signAndSendTransaction?: (
    tx: unknown,
    opts?: { skipPreflight?: boolean; maxRetries?: number },
  ) => Promise<{ signature: string }>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

let activeProvider: SolanaInjectedProvider | null = null;

export function getActiveSolanaProvider(): SolanaInjectedProvider | null {
  return activeProvider ?? pickDefaultProvider();
}

export function setActiveSolanaProvider(
  provider: SolanaInjectedProvider | null,
): void {
  activeProvider = provider;
}

function pickDefaultProvider(): SolanaInjectedProvider | null {
  const listed = listSolanaInjectedWallets();
  return listed[0]?.provider ?? null;
}

/** Prefer named injectors; never prefer a bare window.solana MetaMask stub. */
export function listSolanaInjectedWallets(): SolanaInjectedWallet[] {
  if (typeof window === "undefined") return [];
  const w = window as Window & {
    phantom?: { solana?: SolanaInjectedProvider };
    backpack?: { solana?: SolanaInjectedProvider };
    solflare?: SolanaInjectedProvider;
    solana?: SolanaInjectedProvider;
  };
  const out: SolanaInjectedWallet[] = [];
  const seen = new Set<SolanaInjectedProvider>();

  const push = (id: string, name: string, p?: SolanaInjectedProvider | null) => {
    if (!p || seen.has(p)) return;
    if (
      typeof p.connect !== "function" ||
      (typeof p.signAndSendTransaction !== "function" &&
        typeof p.signTransaction !== "function" &&
        typeof p.signAllTransactions !== "function")
    ) {
      return;
    }
    seen.add(p);
    out.push({ id, name, provider: p });
  };

  push("phantom", "Phantom", w.phantom?.solana);
  push("backpack", "Backpack", w.backpack?.solana);
  push("solflare", "Solflare", w.solflare);

  // Last resort: window.solana only if it looks like Phantom/Backpack and not already listed.
  const bare = w.solana;
  if (bare && (bare.isPhantom || bare.isBackpack) && !seen.has(bare)) {
    push(
      bare.isPhantom ? "phantom" : "backpack",
      bare.isPhantom ? "Phantom" : "Backpack",
      bare,
    );
  }

  return out;
}
