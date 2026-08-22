"use client";

import Link from "next/link";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { ILLUSTRATIVE_DEXLA } from "@/lib/fixtures";
import { getClientFeatureFlags } from "@/lib/feature-flags";

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { wallet, connectDemo, disconnect } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const dexla = ILLUSTRATIVE_DEXLA;

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-app-line bg-app-elevated px-3 py-3 sm:gap-3 sm:px-4 lg:px-6">
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="mr-1 rounded-lg border border-app-line px-2.5 py-1.5 text-sm text-app-muted lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <div className="mr-auto min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-app-dim sm:text-xs">
          Network · Illustrative
        </p>
        <p className="truncate text-xs text-app-muted sm:text-sm">
          Ethereum · Base · Solana
        </p>
      </div>

      <button
        type="button"
        onClick={wallet.state === "connected" ? disconnect : connectDemo}
        className="max-w-[140px] truncate rounded-lg border border-app-line px-2 py-1.5 text-xs font-medium text-app-ink sm:max-w-none sm:px-3"
      >
        {wallet.state === "connected"
          ? wallet.shortenedAddress
          : "Connect Wallet"}
      </button>

      <div className="hidden rounded-lg border border-app-line px-3 py-1.5 text-xs sm:block">
        <span className="text-app-dim">$DEXLA · </span>
        <span className="font-medium text-app-ink">
          {dexla.balance.toLocaleString()}
        </span>
        {flags.DEXLA_DEMO_MODE ? (
          <span className="ml-2 rounded bg-app-warning/15 px-1.5 py-0.5 text-[10px] text-app-warning">
            Demo
          </span>
        ) : null}
      </div>

      <div className="hidden rounded-lg border border-app-line px-3 py-1.5 text-xs md:block">
        <span className="text-app-dim">Save · </span>
        <span className="font-medium text-app-ink">
          {dexla.discountPercent > 0
            ? `${dexla.discountPercent}% Fee Discount`
            : "No Discount"}
        </span>
      </div>

      <Link
        href="/app/portfolio"
        className="hidden rounded-lg border border-app-line px-3 py-1.5 text-xs font-medium text-app-muted hover:text-app-ink sm:inline-block"
      >
        Notifications
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-lg border border-app-line px-2.5 py-1.5 text-xs font-medium text-app-muted hover:text-app-ink"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? "Dark" : "Light"}
      </button>
    </header>
  );
}
