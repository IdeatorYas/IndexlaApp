"use client";

import { useEffect, useState } from "react";
import {
  listSolanaInjectedWallets,
  waitForSolanaWallets,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";

/**
 * Always shown on Connect Wallet click for Solana products.
 * Polls briefly for late Phantom injection.
 */
export function SolanaWalletPickerModal({
  open,
  busy,
  error,
  onClose,
  onPick,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onPick: (wallet: SolanaInjectedWallet) => void;
}) {
  const [wallets, setWallets] = useState<SolanaInjectedWallet[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScanning(true);
    setWallets(listSolanaInjectedWallets());
    void waitForSolanaWallets(2500).then((list) => {
      if (!cancelled) {
        setWallets(list);
        setScanning(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

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
          Choose a Solana wallet. Approve the connection prompt in the extension.
        </p>
        {scanning && wallets.length === 0 ? (
          <p className="text-[12px] text-app-dim">Looking for wallets…</p>
        ) : null}
        {!scanning && wallets.length === 0 ? (
          <div className="space-y-2 text-[12px] text-app-dim">
            <p>No Solana wallet extension detected in this browser.</p>
            <a
              className="font-semibold text-app-brand underline"
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
            >
              Install Phantom
            </a>
          </div>
        ) : (
          <ul className="space-y-2">
            {wallets.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  data-testid={`solana-wallet-option-${w.id}`}
                  disabled={busy}
                  className="app-interactive flex h-11 w-full items-center justify-between rounded-xl border border-app-line px-3 text-left text-[13px] font-semibold text-app-ink hover:border-app-brand/50 disabled:opacity-60"
                  onClick={() => onPick(w)}
                >
                  <span>{w.name}</span>
                  <span className="text-[11px] font-normal text-app-dim">
                    {busy ? "Connecting…" : "Connect"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p className="mt-3 text-[12px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
