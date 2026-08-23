"use client";

import { DiscoveryListsSection } from "@/components/dashboard/DiscoveryListsSection";
import { ExploreMarketplaceSection } from "@/components/dashboard/ExploreMarketplaceSection";
import { MarketplaceHeroSection } from "@/components/dashboard/MarketplaceHeroSection";
import { TrustStripSection } from "@/components/dashboard/TrustStripSection";
import { getDashboard } from "@/lib/data";

export function DashboardView() {
  const dashboardResult = getDashboard();
  const data = dashboardResult.data;

  return (
    <div
      className="mx-auto space-y-1.5 sm:space-y-2"
      style={{ maxWidth: "var(--content-max)" }}
    >
      <MarketplaceHeroSection />
      <DiscoveryListsSection marketplace={data.marketplace} />
      <ExploreMarketplaceSection />
      <TrustStripSection />
    </div>
  );
}
