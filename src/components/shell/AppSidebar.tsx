"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/routes";

const ICONS: Record<string, string> = {
  Dashboard: "◈",
  Discover: "⌕",
  "Degen Club": "⇪",
  "Create Portfolio": "+",
  "My Portfolio": "▣",
  Strategies: "▦",
  Leaderboard: "★",
  Creators: "◉",
};

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="relative flex h-full w-[260px] shrink-0 flex-col border-r border-app-line bg-app-sidebar">
      <div className="border-b border-app-line px-5 py-5">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3"
        >
          <Image
            src="/logo/indexla-logo-transparent.png"
            alt="INDEXLA"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
            priority
          />
          <div>
            <p className="app-display text-base font-bold tracking-tight text-app-ink">
              INDEXLA
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-dim">
              Invest in Everything
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-l-[3px] bg-[var(--sidebar-active-bg)] pl-[9px] text-app-brand"
                  : "border-l-[3px] border-transparent text-app-muted hover:bg-app-panel hover:text-app-ink",
              ].join(" ")}
              style={
                active
                  ? { borderLeftColor: "var(--sidebar-active-border)" }
                  : undefined
              }
            >
              <span
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-lg text-xs",
                  active
                    ? "bg-app-brand/15 text-app-brand"
                    : "bg-app-panel text-app-dim",
                ].join(" ")}
                aria-hidden
              >
                {ICONS[item.label] ?? "•"}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-wave relative mt-auto border-t border-app-line px-4 py-4">
        <p className="text-xs font-semibold text-app-ink">Non-custodial</p>
        <p className="mt-1 text-[11px] leading-relaxed text-app-dim">
          Your keys. Your assets. Your permissions.
        </p>
      </div>
    </aside>
  );
}
