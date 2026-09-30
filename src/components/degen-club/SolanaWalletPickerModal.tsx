"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listSolanaInjectedWallets,
  waitForSolanaWallets,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";
import {
  currentProductUrl,
  isMobileUserAgent,
  isPhantomProviderPresent,
  launchPhantomHandoff,
} from "@/lib/degen-solana/phantom-mobile";

/**
 * Visible bottom-sheet Connect Wallet → select → approve.
 * Mobile handoff runs only after Phantom is selected when not injected.
 */
export function SolanaWalletPickerModal({
  open,
  busy,
  error,
  onClose,
  onPick,
  autoConnect = false,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onPick: (wallet: SolanaInjectedWallet) => void;
  autoConnect?: boolean;
}) {
  const [wallets, setWallets] = useState<SolanaInjectedWallet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const autoConnectedRef = useRef(false);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mobile = isMobileUserAgent(ua);

  const options = useMemo(() => {
    if (wallets.length > 0) return wallets;
    return [
      {
        id: "phantom",
        name: "Phantom",
        provider: {
          connect: async () => {
            throw new Error("Phantom not injected");
          },
        },
      } satisfies SolanaInjectedWallet,
    ];
  }, [wallets]);

  useEffect(() => {
    if (!open) {
      autoConnectedRef.current = false;
      setLocalError(null);
      return;
    }
    let cancelled = false;
    setScanning(true);
    setLocalError(null);
    setWallets(listSolanaInjectedWallets());

    const timeoutMs = autoConnect || mobile ? 6000 : 2000;
    void waitForSolanaWallets(timeoutMs).then((list) => {
      if (cancelled) return;
      setWallets(list);
      setScanning(false);
      if (
        autoConnect &&
        list.length > 0 &&
        list[0] &&
        !autoConnectedRef.current
      ) {
        autoConnectedRef.current = true;
        onPickRef.current(list[0]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, autoConnect, mobile]);

  function selectWallet(w: SolanaInjectedWallet) {
    setLocalError(null);
    const injected =
      listSolanaInjectedWallets().find((x) => x.id === w.id) ??
      (isPhantomProviderPresent() && w.id === "phantom"
        ? listSolanaInjectedWallets()[0]
        : null);

    if (injected?.provider?.connect) {
      onPick(injected);
      return;
    }

    if (w.id === "phantom" && mobile) {
      launchPhantomHandoff(currentProductUrl());
      return;
    }

    if (w.id === "phantom") {
      setLocalError(
        "Phantom extension not detected. Install Phantom, or open this page in the Phantom app on mobile.",
      );
      return;
    }

    setLocalError(`${w.name} is not available in this browser.`);
  }

  if (!open) return null;

  const displayError = error ?? localError;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
      data-testid="solana-wallet-picker"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-app-line bg-app-elevated p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-4"
        data-testid="solana-wallet-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex justify-center sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-app-line" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-app-ink">Connect Wallet</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-app-dim hover:bg-app-muted/40 hover:text-app-ink"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-[13px] leading-snug text-app-dim">
          Select Phantom, then approve the connection in your wallet.
        </p>
        {scanning && wallets.length === 0 ? (
          <p
            className="mb-3 text-[13px] text-app-dim"
            data-testid="wallet-scanning"
          >
            Looking for wallets…
          </p>
        ) : null}
        <ul className="space-y-2">
          {options.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                data-testid={`solana-wallet-option-${w.id}`}
                disabled={busy}
                className="app-interactive flex h-12 w-full items-center justify-between rounded-xl border border-app-line px-4 text-left text-[14px] font-semibold text-app-ink hover:border-app-brand/50 disabled:opacity-60"
                onClick={() => selectWallet(w)}
              >
                <span>{w.name}</span>
                <span className="text-[12px] font-normal text-app-dim">
                  {busy ? "Connecting…" : "Connect"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {displayError ? (
          <p
            className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] leading-snug text-red-700 dark:text-red-300"
            role="alert"
            data-testid="wallet-connect-error"
          >
            {displayError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
