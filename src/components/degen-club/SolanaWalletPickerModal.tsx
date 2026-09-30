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
 * Connect Wallet → select wallet → approve.
 * If Phantom isn't injected on mobile, selecting Phantom launches the browse
 * handoff (no separate "Open in Phantom" step).
 */
export function SolanaWalletPickerModal({
  open,
  busy,
  error,
  onClose,
  onPick,
  /** After handoff return: auto-connect the injected Phantom. */
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

  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mobile = isMobileUserAgent(ua);

  /** Always offer Phantom even when not yet injected (selection triggers handoff). */
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

    // Mobile without inject: selecting Phantom launches handoff directly.
    if (w.id === "phantom" && mobile) {
      launchPhantomHandoff(currentProductUrl());
      return;
    }

    if (w.id === "phantom") {
      setLocalError(
        "Phantom extension not detected. Install Phantom for this browser, or open this page in Phantom on mobile.",
      );
      return;
    }

    setLocalError(`${w.name} is not available in this browser.`);
  }

  if (!open) return null;

  const displayError = error ?? localError;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect Wallet"
      data-testid="solana-wallet-picker"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-app-line bg-app-elevated p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-app-ink">Connect Wallet</h2>
          <button
            type="button"
            className="text-xs text-app-dim hover:text-app-ink"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mb-3 text-[12px] text-app-dim">
          Select Phantom, then approve the connection.
        </p>
        {scanning && wallets.length === 0 ? (
          <p className="mb-2 text-[12px] text-app-dim" data-testid="wallet-scanning">
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
                className="app-interactive flex h-11 w-full items-center justify-between rounded-xl border border-app-line px-3 text-left text-[13px] font-semibold text-app-ink hover:border-app-brand/50 disabled:opacity-60"
                onClick={() => selectWallet(w)}
              >
                <span>{w.name}</span>
                <span className="text-[11px] font-normal text-app-dim">
                  {busy ? "Connecting…" : "Connect"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {displayError ? (
          <p
            className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-[12px] text-red-700 dark:text-red-300"
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
