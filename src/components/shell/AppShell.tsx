"use client";

import { useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { GlobalCommandSearch } from "@/components/shell/GlobalCommandSearch";
import { PreviewBanner } from "@/components/shell/PreviewBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        <PreviewBanner />
        <AppHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-3 py-4 sm:px-5 lg:px-6 lg:py-5">{children}</main>
      </div>
      <GlobalCommandSearch />
    </div>
  );
}
