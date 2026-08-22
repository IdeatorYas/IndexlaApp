"use client";

import { useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { PreviewBanner } from "@/components/shell/PreviewBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-app-bg text-app-ink">
      <div
        className={[
          "fixed inset-0 z-40 bg-black/40 lg:hidden",
          mobileNavOpen ? "block" : "hidden",
        ].join(" ")}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden={!mobileNavOpen}
      />
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform lg:static lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <AppSidebar onNavigate={() => setMobileNavOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col lg:ml-0">
        <PreviewBanner />
        <AppHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
