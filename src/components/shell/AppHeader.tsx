"use client";

import Link from "next/link";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { ILLUSTRATIVE_DEXLA } from "@/lib/fixtures";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { APP_ROUTES } from "@/lib/routes";

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { wallet, connectDemo, disconnect } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const dexla = ILLUSTRATIVE_DEXLA;

  return (
    <header
      className="flex flex-wrap items-center gap-2 border-b border-app-line bg-app-elevated/95 px-3 py-3 backdrop-blur-md sm:gap-3 sm:px-5 lg:px-6"
      role="banner"
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="mr-1 rounded-xl border border-app-line bg-app-panel px-2.5 py-1.5 text-sm text-app-muted lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <form
        action={APP_ROUTES.discover}
        className="order-last w-full min-w-0 sm:order-none sm:mr-auto sm:max-w-md sm:flex-1"
      >
        <label className="sr-only" htmlFor="global-marketplace-search">
          Search indexes, portfolios or assets
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-dim">
            ⌕
          </span>
          <input
            id="global-marketplace-search"
            name="q"
            type="search"
            placeholder="Search indexes, portfolios or assets"
            className="w-full rounded-xl border border-app-line bg-app-panel py-2.5 pl-9 pr-14 text-sm text-app-ink outline-none placeholder:text-app-dim focus:border-app-brand/40 focus:shadow-[var(--shadow-glow)]"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-app-line px-1.5 py-0.5 text-[10px] font-semibold text-app-dim">
            ⌘K
          </span>
        </div>
      </form>

      <button
        type="button"
        onClick={wallet.state === "connected" ? disconnect : connectDemo}
        className="max-w-[150px] truncate rounded-full border border-app-line bg-app-elevated px-3 py-2 text-xs font-bold text-app-ink sm:max-w-none"
      >
        {wallet.state === "connected"
          ? wallet.shortenedAddress
          : "Connect Wallet"}
      </button>

      <div className="hidden items-center gap-1.5 rounded-full border border-app-brand/25 bg-app-soft px-3 py-2 text-xs sm:flex">
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

      <div className="hidden rounded-full border border-app-line px-3 py-2 text-xs md:block">
        <span className="text-app-dim">Save · </span>
        <span className="font-semibold text-app-ink">
          {dexla.discountPercent > 0
            ? `${dexla.discountPercent}% Fee Discount`
            : "No Discount"}
        </span>
      </div>

      <Link
        href="/app/portfolio?tab=notifications"
        className="relative rounded-full border border-app-line px-2.5 py-2 text-xs font-medium text-app-muted hover:text-app-ink"
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
        className="rounded-full border border-app-line px-2.5 py-2 text-xs font-medium text-app-muted hover:text-app-ink"
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? "☾" : "☀"}
      </button>
    </header>
  );
}
