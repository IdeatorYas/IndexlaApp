"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { FeaturedCarouselSection } from "@/components/dashboard/FeaturedCarouselSection";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { GlobalCommandSearch } from "@/components/shell/GlobalCommandSearch";
import { getDashboard } from "@/lib/data";
import { APP_ROUTES } from "@/lib/routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const isDashboard = pathname === APP_ROUTES.dashboard;
  const featuredProducts = isDashboard
    ? getDashboard().data.featuredProducts
    : [];

  return (
    <div className="flex min-h-screen bg-app-bg text-app-ink">
      <div
        className={[
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden",
          mobileNavOpen ? "block" : "hidden",
        ].join(" ")}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden={!mobileNavOpen}
      />
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ width: "var(--sidebar-width)" }}
      >
        <AppSidebar onNavigate={() => setMobileNavOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {isDashboard ? (
          <FeaturedCarouselSection products={featuredProducts} placement="top" />
        ) : null}
        <AppHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-3 py-2 sm:px-5 lg:px-6 lg:py-3">{children}</main>
      </div>
      <GlobalCommandSearch />
    </div>
  );
}
