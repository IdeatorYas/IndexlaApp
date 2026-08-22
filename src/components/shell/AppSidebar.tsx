"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/NavIcons";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { NAV_ITEMS } from "@/lib/routes";
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
          className="flex items-center gap-2.5"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 ring-1 ring-app-line">
            <Image
              src="/logo/indexla-logo-hq.png"
              alt="INDEXLA"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
              priority
            />
          </span>
          <div className="min-w-0">
            <p className="app-display text-[15px] font-bold leading-none tracking-tight text-app-ink">
              INDEXLA
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-app-muted">
              Invest in Everything
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold transition-colors",
                active
                  ? "bg-[var(--sidebar-active-bg)] text-app-brand shadow-[inset_3px_0_0_var(--sidebar-active-border)]"
                  : "text-app-ink/75 hover:bg-app-panel hover:text-app-ink",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-app-brand/15 text-app-brand"
                    : "text-app-muted group-hover:text-app-ink",
                ].join(" ")}
              >
                <NavIcon name={item.label} className="h-4 w-4" />
              </span>
              <span className="truncate">{item.label}</span>
              {item.label === "Degen Club" ? (
                <span
                  aria-hidden
                  className="ml-auto rounded-full bg-app-brand/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-brand"
                >
                  New
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-wave relative mt-auto border-t border-app-line p-3">
        <div className="rounded-[10px] border border-app-line bg-app-panel/80 p-3">
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
            href="/app/portfolio?action=buy-dexla"
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
