"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listSolanaInjectedWallets,
  waitForSolanaWallets,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";
import {
  buildPhantomOpenInAppHref,
  currentProductUrl,
  isMobileUserAgent,
  isPhantomInAppBrowser,
} from "@/lib/degen-solana/phantom-mobile";

/**
 * Always shown on Connect Wallet click for Solana products.
 * Desktop: list injected wallets.
 * Mobile (no inject): Open in Phantom via browse deep link (preserves product URL).
 * Inside Phantom browser: wait for inject, then connect normally.
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
  const [ua, setUa] = useState("");
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const autoConnectedRef = useRef(false);

  const mobile = useMemo(() => (ua ? isMobileUserAgent(ua) : false), [ua]);
  const inPhantom = useMemo(
    () => (ua ? isPhantomInAppBrowser(ua) : false),
    [ua],
  );
  const openInPhantomHref = useMemo(() => {
    if (typeof window === "undefined" || !ua) return "https://phantom.app/download";
    return buildPhantomOpenInAppHref(currentProductUrl(), ua);
  }, [ua]);

  useEffect(() => {
    if (!open) {
      autoConnectedRef.current = false;
      return;
    }
    setUa(typeof navigator !== "undefined" ? navigator.userAgent : "");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScanning(true);
    setWallets(listSolanaInjectedWallets());
    // Phantom in-app browser injects slightly later than desktop extensions.
    const timeoutMs = inPhantom || mobile ? 4000 : 2500;
    void waitForSolanaWallets(timeoutMs).then((list) => {
      if (cancelled) return;
      setWallets(list);
      setScanning(false);
      // Inside Phantom: one injected wallet → connect immediately.
      if (
        inPhantom &&
        list.length === 1 &&
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
  }, [open, inPhantom, mobile]);

  if (!open) return null;

  const showMobileHandoff =
    !scanning && wallets.length === 0 && mobile && !inPhantom;
  const showInPhantomWaiting =
    scanning && wallets.length === 0 && inPhantom;
  const showInPhantomEmpty =
    !scanning && wallets.length === 0 && inPhantom;
  const showDesktopEmpty =
    !scanning && wallets.length === 0 && !mobile;

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
          {showMobileHandoff
            ? "Open this page in Phantom to connect your installed wallet."
            : inPhantom
              ? "Approve the connection prompt in Phantom."
              : "Choose a Solana wallet. Approve the connection prompt in the extension."}
        </p>
        {scanning && wallets.length === 0 && !showInPhantomWaiting ? (
          <p className="text-[12px] text-app-dim">Looking for wallets…</p>
        ) : null}
        {showInPhantomWaiting ? (
          <p className="text-[12px] text-app-dim" data-testid="phantom-inapp-scanning">
            Connecting to Phantom…
          </p>
        ) : null}
        {showMobileHandoff ? (
          <div className="space-y-3" data-testid="phantom-mobile-handoff">
            <a
              data-testid="open-in-phantom"
              className="app-interactive flex h-11 w-full items-center justify-center rounded-xl border border-app-brand/50 bg-app-brand/10 px-3 text-[13px] font-bold text-app-ink hover:border-app-brand"
              href={openInPhantomHref}
              rel="noreferrer"
            >
              Open in Phantom
            </a>
            <p className="text-[11px] text-app-dim">
              Already have Phantom? This opens the same product page inside the app.
            </p>
            <a
              className="block text-center text-[11px] text-app-dim underline"
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
            >
              Don’t have Phantom? Download
            </a>
          </div>
        ) : null}
        {showInPhantomEmpty ? (
          <div className="space-y-2 text-[12px] text-app-dim" data-testid="phantom-inapp-retry">
            <p>Phantom wallet not ready yet. Tap retry after a moment.</p>
            <button
              type="button"
              className="app-interactive h-10 w-full rounded-xl border border-app-line text-[13px] font-semibold text-app-ink"
              onClick={() => {
                setScanning(true);
                void waitForSolanaWallets(4000).then((list) => {
                  setWallets(list);
                  setScanning(false);
                });
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {showDesktopEmpty ? (
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
        ) : null}
        {wallets.length > 0 ? (
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
        ) : null}
        {error ? (
          <p className="mt-3 text-[12px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
