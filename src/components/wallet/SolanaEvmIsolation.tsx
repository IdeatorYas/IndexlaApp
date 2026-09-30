"use client";

/**
 * Solana product isolation — EVM AppKit must not show Base/Robinhood switch
 * while the user is on /app/degen-club.
 *
 * Root cause: global AppKit reconnects Phantom's EVM provider; chain ∉ {8453,4663}
 * → Reown UnsupportedChain modal listing Base + Robinhood.
 *
 * On Solana routes: close any AppKit modal and disconnect the EVM session.
 * Solana connect uses SolanaWalletProvider only.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";
import { hasWalletConnectProjectId } from "@/lib/wallet/wagmi-config";

function isSolanaProductPath(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith("/app/degen-club"));
}

export function SolanaEvmIsolation() {
  const pathname = usePathname();
  const { close } = useAppKit();
  const { disconnectAsync } = useDisconnect();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!hasWalletConnectProjectId()) return;
    if (!isSolanaProductPath(pathname)) {
      lastPath.current = pathname;
      return;
    }

    // Entering / staying on Solana: clear EVM modal + session so AppKit cannot
    // re-open UnsupportedChain (Base / Robinhood list) over Solana UI.
    let cancelled = false;
    const run = async () => {
      try {
        await close();
      } catch {
        /* modal may already be closed */
      }
      if (cancelled) return;
      try {
        await disconnectAsync();
      } catch {
        /* already disconnected / user rejection */
      }
      // Remove stuck AppKit overlay if present (UnsupportedChain refuses safeClose).
      try {
        document
          .querySelectorAll("w3m-modal, appkit-modal")
          .forEach((el) => {
            (el as HTMLElement).style.display = "none";
            el.remove();
          });
      } catch {
        /* ignore */
      }
    };
    void run();
    lastPath.current = pathname;
    return () => {
      cancelled = true;
    };
  }, [pathname, close, disconnectAsync]);

  return null;
}
