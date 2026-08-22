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
    <header className="flex flex-wrap items-center gap-2 border-b border-app-line bg-app-elevated/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-5 lg:px-6">
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="mr-1 rounded-xl border border-app-line px-2.5 py-1.5 text-sm text-app-muted lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <div className="mr-auto min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-dim">
          Networks · Illustrative
        </p>
        <p className="truncate text-xs text-app-muted sm:text-sm">
          Ethereum · Base · Arbitrum · Solana
        </p>
      </div>

      <button
        type="button"
        onClick={wallet.state === "connected" ? disconnect : connectDemo}
        className="max-w-[150px] truncate rounded-full border border-app-line bg-app-elevated px-3 py-1.5 text-xs font-semibold text-app-ink sm:max-w-none"
      >
        {wallet.state === "connected"
          ? wallet.shortenedAddress
          : "Connect Wallet"}
      </button>

      <div className="hidden items-center gap-1.5 rounded-full border border-app-brand/20 bg-app-soft px-3 py-1.5 text-xs sm:flex">
        <span className="font-semibold text-app-brand-soft">$DEXLA</span>
        <span className="font-bold text-app-ink">
          {dexla.balance.toLocaleString()}
        </span>
        {flags.DEXLA_DEMO_MODE ? (
          <span className="rounded-full bg-app-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-app-warning">
            Demo
          </span>
        ) : null}
      </div>

      <div className="hidden rounded-full border border-app-line px-3 py-1.5 text-xs md:block">
        <span className="text-app-dim">Save · </span>
        <span className="font-semibold text-app-ink">
          {dexla.discountPercent > 0
            ? `${dexla.discountPercent}% Fee Discount`
            : "No Discount"}
        </span>
      </div>

      <Link
        href="/app/portfolio?tab=notifications"
        className="relative rounded-full border border-app-line px-2.5 py-1.5 text-xs font-medium text-app-muted hover:text-app-ink"
        aria-label="Notifications"
      >
        🔔
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-app-brand" />
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-full border border-app-line px-2.5 py-1.5 text-xs font-medium text-app-muted hover:text-app-ink"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? "☾ Dark" : "☀ Light"}
      </button>
    </header>
  );
}
