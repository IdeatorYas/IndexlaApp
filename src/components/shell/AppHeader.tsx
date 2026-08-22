"use client";

import Link from "next/link";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { getDexlaBalance } from "@/lib/data";
import { APP_ROUTES } from "@/lib/routes";

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { wallet, connectDemo, disconnect } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const dexla = getDexlaBalance().data;

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b border-app-line bg-app-elevated/95 px-3 backdrop-blur-md sm:gap-2.5 sm:px-5 lg:px-6"
      role="banner"
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-[10px] border border-app-line bg-app-panel px-2.5 py-1.5 text-sm text-app-muted lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <form
        action={APP_ROUTES.discover}
        className="mr-auto min-w-0 flex-1 sm:max-w-lg"
      >
        <label className="sr-only" htmlFor="global-marketplace-search">
          Search indexes, portfolios or assets
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-app-dim">
            ⌕
          </span>
          <input
            id="global-marketplace-search"
            name="q"
            type="search"
            placeholder="Search indexes, portfolios or assets"
            className="h-9 w-full rounded-[10px] border border-app-line bg-app-panel py-0 pl-8 pr-12 text-[13px] text-app-ink outline-none placeholder:text-app-dim focus:border-app-brand/45"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-app-line px-1.5 py-0.5 text-[9px] font-bold text-app-dim">
            ⌘K
          </span>
        </div>
      </form>

      <button
        type="button"
        onClick={wallet.state === "connected" ? disconnect : connectDemo}
        className="h-9 max-w-[140px] truncate rounded-full border border-app-line bg-app-elevated px-3 text-[12px] font-bold text-app-ink sm:max-w-none"
      >
        {wallet.state === "connected"
          ? wallet.shortenedAddress
          : "Connect Wallet"}
      </button>

      <div className="hidden h-9 items-center gap-1.5 rounded-full border border-app-brand/25 bg-app-soft px-3 text-[12px] sm:flex">
        <span className="font-semibold text-app-brand-soft">$DEXLA</span>
        <span className="font-bold text-app-ink">
          {dexla.balance.toLocaleString()}
        </span>
        {flags.DEXLA_DEMO_MODE ? (
          <span className="rounded-full bg-app-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-app-warning">
            Demo
          </span>
        ) : null}
      </div>

      <div className="hidden h-9 items-center rounded-full border border-app-line px-3 text-[12px] md:flex">
        <span className="text-app-dim">Save · </span>
        <span className="font-semibold text-app-ink">
          {dexla.discountPercent > 0
            ? `${dexla.discountPercent}% Fee Discount`
            : "No Discount"}
        </span>
      </div>

      <Link
        href="/app/portfolio?tab=notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-app-line text-sm text-app-muted hover:text-app-ink"
        aria-label="Notifications"
      >
        🔔
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-app-brand px-1 text-[9px] font-bold text-white">
          3
        </span>
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-app-line text-sm text-app-muted hover:text-app-ink"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? "☾" : "☀"}
      </button>
    </header>
  );
}
