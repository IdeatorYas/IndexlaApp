"use client";

/**
 * Injected Solana wallet discovery (Phantom / Backpack / Solflare + Wallet Standard).
 * Shared by AppHeader and SolanaMemeBasketPanel.
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
    publicKey?: { toString(): string };
  } | void>;
  disconnect?: () => Promise<void>;
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

/** Wallet Standard registrations discovered via register-wallet events. */
const standardProviders = new Map<string, SolanaInjectedWallet>();

export function getActiveSolanaProvider(): SolanaInjectedProvider | null {
  return activeProvider ?? listSolanaInjectedWallets()[0]?.provider ?? null;
}

export function setActiveSolanaProvider(
  provider: SolanaInjectedProvider | null,
): void {
  activeProvider = provider;
}

function canConnect(p: unknown): p is SolanaInjectedProvider {
  return (
    !!p &&
    typeof p === "object" &&
    typeof (p as SolanaInjectedProvider).connect === "function"
  );
}

function pushUnique(
  out: SolanaInjectedWallet[],
  seen: Set<object>,
  id: string,
  name: string,
  p?: SolanaInjectedProvider | null,
) {
  if (!canConnect(p) || seen.has(p)) return;
  seen.add(p);
  out.push({ id, name, provider: p });
}

/**
 * Start listening for Wallet Standard wallets (Phantom etc. register async).
 * Safe to call multiple times.
 */
export function ensureWalletStandardListeners(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __indexlaWalletStd?: boolean;
  };
  if (w.__indexlaWalletStd) return;
  w.__indexlaWalletStd = true;

  const onRegister = (event: Event) => {
    const detail = (
      event as CustomEvent<{
        register?: (api: {
          register: (wallet: {
            name?: string;
            features?: Record<string, unknown>;
          }) => void;
        }) => void;
      }>
    ).detail;
    try {
      detail?.register?.({
        register(wallet) {
          const name = wallet?.name ?? "Solana Wallet";
          const id = name.toLowerCase().replace(/\s+/g, "-");
          // Prefer classic injectors for signing; Standard wallets still surface in UI
          // when they also expose window.phantom.solana etc.
          if (!standardProviders.has(id)) {
            // Store a stub only if we can later resolve a classic provider by name.
            standardProviders.set(id, {
              id,
              name,
              provider: {
                connect: async () => {
                  throw new Error(
                    `${name} registered via Wallet Standard — use its browser extension inject (window.phantom.solana).`,
                  );
                },
              },
            });
          }
        },
      });
    } catch {
      /* ignore malformed register-wallet */
    }
  };

  window.addEventListener("wallet-standard:register-wallet", onRegister);
  // Announce app readiness so wallets re-register.
  try {
    window.dispatchEvent(
      new CustomEvent("wallet-standard:app-ready", {
        detail: {
          register(wallet: { name?: string }) {
            const name = wallet?.name ?? "Solana Wallet";
            const id = name.toLowerCase().replace(/\s+/g, "-");
            if (!standardProviders.has(id)) {
              standardProviders.set(id, {
                id,
                name,
                provider: {
                  connect: async () => {
                    throw new Error(
                      `Open ${name} and retry Connect Wallet.`,
                    );
                  },
                },
              });
            }
          },
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Prefer named injectors. Require only connect() — signing is checked at use time. */
export function listSolanaInjectedWallets(): SolanaInjectedWallet[] {
  if (typeof window === "undefined") return [];
  ensureWalletStandardListeners();

  const w = window as Window & {
    phantom?: { solana?: SolanaInjectedProvider };
    backpack?: { solana?: SolanaInjectedProvider };
    solflare?: SolanaInjectedProvider & { isSolflare?: boolean };
    glowSolana?: SolanaInjectedProvider;
    solana?: SolanaInjectedProvider;
  };

  const out: SolanaInjectedWallet[] = [];
  const seen = new Set<object>();

  pushUnique(out, seen, "phantom", "Phantom", w.phantom?.solana);
  pushUnique(out, seen, "backpack", "Backpack", w.backpack?.solana);
  pushUnique(out, seen, "solflare", "Solflare", w.solflare);
  pushUnique(out, seen, "glow", "Glow", w.glowSolana);

  const bare = w.solana;
  if (bare && (bare.isPhantom || bare.isBackpack || bare.isSolflare)) {
    pushUnique(
      out,
      seen,
      bare.isPhantom ? "phantom" : bare.isBackpack ? "backpack" : "solflare",
      bare.isPhantom ? "Phantom" : bare.isBackpack ? "Backpack" : "Solflare",
      bare,
    );
  }

  // If classic injectors missing but Standard announced Phantom, still offer a
  // retry entry that re-reads window.phantom.solana at click time.
  if (out.length === 0 && standardProviders.has("phantom")) {
    out.push({
      id: "phantom",
      name: "Phantom",
      provider: {
        connect: async (opts) => {
          const p = (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana;
          if (!p?.connect) {
            throw new Error(
              "Phantom is installed but not injected yet. Refresh and retry.",
            );
          }
          return p.connect(opts);
        },
        get publicKey() {
          return (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana?.publicKey;
        },
        signAndSendTransaction: (tx, opts) => {
          const p = (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana;
          if (!p?.signAndSendTransaction) {
            throw new Error("Phantom missing signAndSendTransaction");
          }
          return p.signAndSendTransaction(tx, opts);
        },
        signTransaction: (tx) => {
          const p = (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana;
          if (!p?.signTransaction) throw new Error("Phantom missing signTransaction");
          return p.signTransaction(tx);
        },
        signAllTransactions: (txs) => {
          const p = (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana;
          if (!p?.signAllTransactions) {
            throw new Error("Phantom missing signAllTransactions");
          }
          return p.signAllTransactions(txs);
        },
        disconnect: async () => {
          await (
            window as Window & { phantom?: { solana?: SolanaInjectedProvider } }
          ).phantom?.solana?.disconnect?.();
        },
      },
    });
  }

  return out;
}

/** Wait briefly for late Phantom injection (common on hard refresh). */
export async function waitForSolanaWallets(
  timeoutMs = 2500,
): Promise<SolanaInjectedWallet[]> {
  ensureWalletStandardListeners();
  const start = Date.now();
  let list = listSolanaInjectedWallets();
  while (list.length === 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 150));
    list = listSolanaInjectedWallets();
  }
  return list;
}

export async function connectSolanaProvider(
  provider: SolanaInjectedProvider,
): Promise<string> {
  const res = await provider.connect({ onlyIfTrusted: false });
  const pk =
    (res && typeof res === "object" && res.publicKey
      ? res.publicKey.toString()
      : null) ?? provider.publicKey?.toString() ?? null;
  if (!pk) {
    throw new Error(
      "Wallet did not return an address. Approve the connection in your wallet, then retry.",
    );
  }
  return pk;
}
