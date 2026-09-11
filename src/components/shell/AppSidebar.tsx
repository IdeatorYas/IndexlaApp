"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/NavIcons";
import { NAV_ITEMS } from "@/lib/routes";

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS;

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
          <span className="relative flex h-11 w-[48px] shrink-0 items-center justify-center overflow-visible">
            <Image
              src="/logo/indexla-logo-transparent.png"
              alt="INDEXLA"
              width={48}
              height={44}
              className="h-11 w-auto max-w-[48px] object-contain"
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

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3.5"
        aria-label="Primary"
      >
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
    </aside>
  );
}
