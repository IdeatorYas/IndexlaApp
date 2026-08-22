"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/routes";

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-app-line bg-app-sidebar">
      <div className="border-b border-app-line px-5 py-5">
        <Link href="/app" className="app-display text-lg font-bold text-app-ink">
          INDEXLA
        </Link>
        <p className="mt-1 text-xs text-app-dim">App · Phase 1 Foundation</p>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-app-brand/15 text-app-brand"
                  : "text-app-muted hover:bg-app-panel hover:text-app-ink",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="border-t border-app-line px-4 py-3 text-xs text-app-dim">
        Your keys. Your assets. Your permissions.
      </p>
    </aside>
  );
}
