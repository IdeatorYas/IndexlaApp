"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/NavIcons";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { APP_ROUTES, NAV_ITEMS } from "@/lib/routes";
import { formatUsd } from "@/lib/dashboard/data";
import { getDexlaBalance } from "@/lib/data";

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { wallet } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const navItems = NAV_ITEMS;
  const dexla = getDexlaBalance().data;
  const initials =
    wallet.state === "connected"
      ? (wallet.shortenedAddress?.slice(2, 4) ?? "IX").toUpperCase()
      : "IX";

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-app-line bg-app-sidebar"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="border-b border-app-line px-3.5 py-4">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible">
            <Image
              src="/logo/indexla-logo-hq.png"
              alt="INDEXLA"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              priority
            />
          </span>
          <div className="min-w-0">
            <p className="app-display text-[16px] font-bold leading-none tracking-tight text-app-ink">
              INDEXLA
            </p>
            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-app-muted">
              Invest in Everything
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3.5" aria-label="Primary">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "group relative flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[15px] font-semibold leading-snug app-interactive",
                active
                  ? "bg-[var(--sidebar-active-bg)] text-app-brand shadow-[inset_3px_0_0_var(--sidebar-active-border)]"
                  : "text-app-ink/80 hover:bg-app-panel hover:text-app-ink",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-app-brand/15 text-app-brand"
                    : "text-app-muted group-hover:text-app-ink",
                ].join(" ")}
              >
                <NavIcon name={item.label} className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate">{item.label}</span>
              {item.label === "Stable Club" ? (
                <span
                  aria-hidden
                  className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300"
                >
                  Live Beta
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-wave relative mt-auto border-t border-app-line p-3">
        <div className="rounded-[10px] border border-app-line bg-gradient-to-br from-app-panel/90 to-app-elevated/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-[11px] font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-app-ink">
                {wallet.state === "connected"
                  ? wallet.shortenedAddress
                  : "Guest explorer"}
              </p>
              <p className="text-[10px] text-app-dim">
                {wallet.state === "connected" ? "Connected" : "Browse freely"}
              </p>
            </div>
          </div>
          <div className="mt-2.5 border-t border-app-line pt-2.5">
            <p className="app-label">$DEXLA</p>
            <p className="app-metric mt-0.5 text-[17px] text-app-ink">
              {dexla.balance.toLocaleString()}
            </p>
            <p className="text-[10px] text-app-dim">
              ≈ {formatUsd(dexla.balance * 0.42)}
              {flags.DEXLA_DEMO_MODE ? " · Demo" : ""}
            </p>
          </div>
          <Link
            href={`${APP_ROUTES.portfolio}?action=buy-dexla`}
            onClick={onNavigate}
            className="app-gradient-btn mt-2.5 flex w-full items-center justify-center rounded-[10px] px-3 py-2 text-[11px] font-bold"
          >
            Buy $DEXLA
          </Link>
        </div>
      </div>
    </aside>
  );
}
