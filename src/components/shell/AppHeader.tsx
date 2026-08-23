"use client";

import Link from "next/link";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { PreviewIllustrativeBadge } from "@/components/shell/PreviewIllustrativeBadge";
import { getDexlaBalance } from "@/lib/data";

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { wallet, connectDemo, disconnect } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const dexla = getDexlaBalance().data;

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b border-app-line/80 bg-gradient-to-r from-app-brand/6 via-app-elevated/98 to-[color:var(--color-accent-violet)]/5 px-3 backdrop-blur-md sm:gap-2.5 sm:px-5 lg:px-6"
      role="banner"
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="app-icon-btn rounded-[10px] px-2.5 py-1.5 text-sm lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <PreviewIllustrativeBadge />

      <div className="min-w-0 flex-1 sm:max-w-xl lg:max-w-2xl">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("indexla-open-command-search"))
          }
          className="app-input relative flex h-9 w-full items-center py-0 pl-8 pr-12 text-left text-[13px] text-app-dim hover:border-app-brand/45"
          aria-label="Search portfolios, indexes, creators and strategies"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-app-dim">
            ⌕
          </span>
          <span className="truncate">Search portfolios, indexes, creators…</span>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-app-line px-1.5 py-0.5 text-[9px] font-bold text-app-dim">
            ⌘K
          </span>
        </button>
      </div>

      <div className="hidden h-9 items-center gap-1.5 rounded-full border border-app-brand/25 bg-gradient-to-r from-app-brand/8 to-[color:var(--color-accent-violet)]/6 px-3 text-[12px] sm:flex">
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
        className="app-icon-btn relative h-9 w-9 shrink-0 text-sm"
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
        className="app-icon-btn h-9 w-9 shrink-0 text-sm"
        aria-label={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>

      <button
        type="button"
        onClick={wallet.state === "connected" ? disconnect : connectDemo}
        className="app-interactive ml-0.5 h-9 shrink-0 truncate rounded-full border border-app-brand/35 bg-gradient-to-r from-app-brand/15 to-[color:var(--color-accent-violet)]/12 px-3.5 text-[12px] font-bold text-app-ink hover:border-app-brand/55 hover:shadow-[0_4px_14px_-4px_rgba(37,99,235,0.35)] sm:max-w-none sm:px-4"
      >
        {wallet.state === "connected"
          ? wallet.shortenedAddress
          : "Connect Wallet"}
      </button>
    </header>
  );
}
