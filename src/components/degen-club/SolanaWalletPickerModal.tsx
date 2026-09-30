"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listSolanaInjectedWallets,
  waitForSolanaWallets,
  type SolanaInjectedWallet,
} from "@/lib/degen-solana/injected-wallets";
import {
  buildPhantomBrowseCustomScheme,
  buildPhantomOpenInAppHref,
  currentProductUrl,
  formatWalletStatusLine,
  isMobileUserAgent,
  isPhantomProviderPresent,
  type WalletConnectStage,
} from "@/lib/degen-solana/phantom-mobile";

/**
 * Connect Wallet picker for Solana products.
 *
 * Failure points this UI surfaces:
 * 1) No inject on mobile → Open in Phantom (browse UL, no download fallback)
 * 2) Inject present → Connect Phantom (auto if handoff/autoConnect)
 * 3) connect() throws → visible error + status line
 */
export function SolanaWalletPickerModal({
  open,
  busy,
  error,
  onClose,
  onPick,
  /** When true (handoff return), auto-call onPick once Phantom injects. */
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
  const [ua, setUa] = useState("");
  const [phantomPresent, setPhantomPresent] = useState(false);
  const [stage, setStage] = useState<WalletConnectStage>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const autoConnectedRef = useRef(false);

  const mobile = useMemo(() => (ua ? isMobileUserAgent(ua) : false), [ua]);

  const productUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://app.indexla.tech/app";
    return currentProductUrl();
  }, [open]);

  const openInPhantomHref = useMemo(
    () => buildPhantomOpenInAppHref(productUrl, ua),
    [productUrl, ua],
  );
  const openInPhantomCustom = useMemo(
    () => buildPhantomBrowseCustomScheme(
      (() => {
        try {
          const u = new URL(productUrl);
          u.searchParams.set("ixl_phantom", "1");
          return u.toString();
        } catch {
          return productUrl;
        }
      })(),
    ),
    [productUrl],
  );

  useEffect(() => {
    if (!open) {
      autoConnectedRef.current = false;
      setStage("idle");
      setLocalError(null);
      return;
    }
    setUa(typeof navigator !== "undefined" ? navigator.userAgent : "");
    setPhantomPresent(isPhantomProviderPresent());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScanning(true);
    setStage("scanning");
    setLocalError(null);

    const immediate = listSolanaInjectedWallets();
    setWallets(immediate);
    setPhantomPresent(isPhantomProviderPresent());

    // Mobile / handoff: wait longer — in-app inject can lag past 2–4s.
    const timeoutMs = mobile || autoConnect ? 8000 : 2500;

    void waitForSolanaWallets(timeoutMs).then((list) => {
      if (cancelled) return;
      const present = isPhantomProviderPresent();
      setPhantomPresent(present);
      setWallets(list);
      setScanning(false);

      if (list.length === 0) {
        setStage(mobile && !present ? "handoff" : present ? "injected" : "error");
        if (present && list.length === 0) {
          setLocalError(
            "Phantom object found but no usable Solana provider. Refresh and retry Connect Wallet.",
          );
        }
        return;
      }

      setStage("injected");
      const shouldAuto =
        (autoConnect || present) &&
        list.length >= 1 &&
        !autoConnectedRef.current;
      if (shouldAuto && list[0]) {
        autoConnectedRef.current = true;
        setStage("connecting");
        onPickRef.current(list[0]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, mobile, autoConnect]);

  // Reflect parent busy/error into stage for the status line.
  useEffect(() => {
    if (!open) return;
    if (busy) setStage("connecting");
    else if (error) {
      setStage("error");
      setLocalError(error);
    }
  }, [open, busy, error]);

  if (!open) return null;

  const displayError = error ?? localError;
  const showMobileHandoff =
    !scanning && wallets.length === 0 && mobile && !phantomPresent;
  const showWaiting =
    scanning && wallets.length === 0;
  const showEmptyNoHandoff =
    !scanning && wallets.length === 0 && !showMobileHandoff;

  const statusLine = formatWalletStatusLine({
    stage,
    phantomPresent,
    mobile,
    error: displayError,
  });

  function openPhantomNow(href: string) {
    setStage("handoff");
    setLocalError(null);
    // Direct navigation — required for OS Universal / App Links handoff.
    try {
      window.location.assign(href);
    } catch {
      window.location.href = href;
    }
  }

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

        <p
          className="mb-2 rounded-lg bg-app-muted/40 px-2 py-1.5 font-mono text-[10px] leading-snug text-app-dim"
          data-testid="wallet-connect-status"
          role="status"
        >
          {statusLine}
        </p>

        <p className="mb-3 text-[12px] text-app-dim">
          {showMobileHandoff
            ? "Phantom isn’t in this browser. Open this same page inside Phantom, then approve connect."
            : phantomPresent
              ? "Phantom detected. Approve the connection prompt."
              : "Choose a Solana wallet and approve the connection prompt."}
        </p>

        {showWaiting ? (
          <p className="text-[12px] text-app-dim" data-testid="wallet-scanning">
            Looking for Phantom… ({mobile || autoConnect ? "up to 8s" : "up to 2.5s"})
          </p>
        ) : null}

        {showMobileHandoff ? (
          <div className="space-y-2" data-testid="phantom-mobile-handoff">
            <button
              type="button"
              data-testid="open-in-phantom"
              className="app-interactive flex h-11 w-full items-center justify-center rounded-xl border border-app-brand/50 bg-app-brand/10 px-3 text-[13px] font-bold text-app-ink hover:border-app-brand"
              onClick={() => openPhantomNow(openInPhantomHref)}
            >
              Open in Phantom
            </button>
            <button
              type="button"
              data-testid="open-in-phantom-scheme"
              className="app-interactive flex h-10 w-full items-center justify-center rounded-xl border border-app-line px-3 text-[12px] font-semibold text-app-ink"
              onClick={() => openPhantomNow(openInPhantomCustom)}
            >
              Open via Phantom app link
            </button>
            <p className="text-[11px] text-app-dim">
              Keeps this product URL. After Phantom opens, approve Connect when prompted.
            </p>
          </div>
        ) : null}

        {showEmptyNoHandoff ? (
          <div className="space-y-2 text-[12px] text-app-dim" data-testid="wallet-empty-retry">
            <p>
              {phantomPresent
                ? "Phantom is here but not ready. Tap retry."
                : "No Solana wallet detected."}
            </p>
            <button
              type="button"
              className="app-interactive h-10 w-full rounded-xl border border-app-line text-[13px] font-semibold text-app-ink"
              onClick={() => {
                setScanning(true);
                setStage("scanning");
                void waitForSolanaWallets(8000).then((list) => {
                  setWallets(list);
                  setPhantomPresent(isPhantomProviderPresent());
                  setScanning(false);
                  setStage(list.length ? "injected" : "error");
                  if (list[0] && (autoConnect || isPhantomProviderPresent())) {
                    autoConnectedRef.current = true;
                    setStage("connecting");
                    onPickRef.current(list[0]);
                  }
                });
              }}
            >
              Retry connect
            </button>
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
                  onClick={() => {
                    setStage("connecting");
                    setLocalError(null);
                    onPick(w);
                  }}
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
