"use client";

import Link from "next/link";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { FeaturedCarouselSection } from "@/components/dashboard/FeaturedCarouselSection";
import { PreviewIllustrativeBadge } from "@/components/shell/PreviewIllustrativeBadge";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";

export function DashboardTopBar({
  products,
  onMenuClick,
}: {
  products: FeaturedProductPreview[];
  onMenuClick?: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const { wallet, connect, disconnect } = useDemoWallet();

  return (
    <header
      role="banner"
      className="flex h-12 shrink-0 items-center gap-1.5 border-b border-app-line/80 bg-gradient-to-r from-app-brand/8 via-[color:var(--color-accent-violet)]/6 to-[color:var(--color-accent-cyan)]/6 px-2 backdrop-blur-md sm:gap-2 sm:px-4 lg:px-5"
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="app-icon-btn h-8 w-8 shrink-0 rounded-[8px] text-sm lg:hidden"
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      ) : null}

      <PreviewIllustrativeBadge />

      <FeaturedCarouselSection
        products={products}
        layout="inline"
        className="min-w-0 flex-1"
      />

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <Link
          href="/app/portfolio?tab=notifications"
          className="app-icon-btn relative h-8 w-8 text-sm sm:h-9 sm:w-9"
          aria-label="Notifications"
        >
          🔔
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-app-brand px-0.5 text-[8px] font-bold text-white sm:h-4 sm:min-w-4 sm:text-[9px]">
            3
          </span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="app-icon-btn h-8 w-8 text-sm sm:h-9 sm:w-9"
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>

        <button
          type="button"
          onClick={wallet.state === "connected" ? disconnect : connect}
          className="app-interactive h-8 shrink-0 truncate rounded-full border border-app-brand/35 bg-gradient-to-r from-app-brand/15 to-[color:var(--color-accent-violet)]/12 px-2.5 text-[11px] font-bold text-app-ink hover:border-app-brand/55 hover:shadow-[0_4px_14px_-4px_rgba(37,99,235,0.35)] sm:h-9 sm:px-3.5 sm:text-[12px]"
        >
          {wallet.state === "connected" ? wallet.shortenedAddress : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
