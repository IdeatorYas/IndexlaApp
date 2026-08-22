"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/NavIcons";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { ILLUSTRATIVE_DEXLA } from "@/lib/fixtures";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { NAV_ITEMS } from "@/lib/routes";
import { formatDexla, formatUsd } from "@/lib/dashboard/data";

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { wallet } = useDemoWallet();
  const flags = getClientFeatureFlags();
  const dexla = ILLUSTRATIVE_DEXLA;
  const initials =
    wallet.state === "connected"
      ? (wallet.shortenedAddress?.slice(2, 4) ?? "IX").toUpperCase()
      : "IX";

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-app-line bg-app-sidebar"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="border-b border-app-line px-5 py-5">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3"
        >
          <Image
            src="/logo/indexla-logo-transparent.png"
            alt="INDEXLA"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="app-display text-[17px] font-bold tracking-tight text-app-ink">
              INDEXLA
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-dim">
              Invest in Everything
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all",
                active
                  ? "bg-[var(--sidebar-active-bg)] text-app-brand shadow-[inset_3px_0_0_var(--sidebar-active-border)]"
                  : "text-app-muted hover:bg-app-panel hover:text-app-ink",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-app-brand/15 text-app-brand"
                    : "bg-app-panel text-app-dim group-hover:text-app-ink",
                ].join(" ")}
              >
                <NavIcon name={item.label} />
              </span>
              <span className="truncate">{item.label}</span>
              {item.label === "Degen Club" ? (
                <span
                  aria-hidden
                  className="ml-auto rounded-full bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand"
                >
                  New
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-wave relative mt-auto space-y-3 border-t border-app-line p-4">
        <div className="app-panel-soft p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-xs font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-app-ink">
                {wallet.state === "connected"
                  ? wallet.shortenedAddress
                  : "Guest explorer"}
              </p>
              <p className="text-[11px] text-app-dim">
                {wallet.state === "connected" ? "Wallet connected" : "Browse without wallet"}
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-app-line pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-app-dim">
              $DEXLA Balance
            </p>
            <p className="app-metric mt-1 text-lg text-app-ink">
              {dexla.balance.toLocaleString()}
            </p>
            <p className="text-[11px] text-app-dim">
              ≈ {formatUsd(dexla.balance * 0.42)} · Save {dexla.discountPercent}%
              {flags.DEXLA_DEMO_MODE ? " · Demo" : ""}
            </p>
          </div>
          <Link
            href="/app/portfolio?action=buy-dexla"
            onClick={onNavigate}
            className="app-gradient-btn mt-3 flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold"
          >
            Buy $DEXLA
          </Link>
          <p className="mt-2 text-center text-[10px] text-app-dim">
            {formatDexla(dexla.balance)}
          </p>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-app-dim">
          Your keys. Your assets. Your permissions.
        </p>
      </div>
    </aside>
  );
}
