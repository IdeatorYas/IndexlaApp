"use client";

import { ExploreMarketplaceSection } from "@/components/dashboard/ExploreMarketplaceSection";
import { MarketplaceHeroSection } from "@/components/dashboard/MarketplaceHeroSection";
import { TrustStripSection } from "@/components/dashboard/TrustStripSection";

export function DashboardView() {
  return (
    <div
      className="mx-auto space-y-1 sm:space-y-1.5"
      style={{ maxWidth: "var(--content-max)" }}
    >
      <MarketplaceHeroSection />
      <ExploreMarketplaceSection />
      <TrustStripSection />
    </div>
  );
}
