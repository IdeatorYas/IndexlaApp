"use client";

import { DiscoveryListsSection } from "@/components/dashboard/DiscoveryListsSection";
import { ExploreMarketplaceSection } from "@/components/dashboard/ExploreMarketplaceSection";
import { FeaturedCarouselSection } from "@/components/dashboard/FeaturedCarouselSection";
import { MarketplaceHeroSection } from "@/components/dashboard/MarketplaceHeroSection";
import { TrustStripSection } from "@/components/dashboard/TrustStripSection";
import { getDashboard } from "@/lib/data";

export function DashboardView() {
  const dashboardResult = getDashboard();
  const data = dashboardResult.data;

  return (
    <div className="mx-auto" style={{ maxWidth: "var(--content-max)" }}>
      <div className="relative -mx-3 -mt-4 sm:-mx-5 lg:-mx-6 lg:-mt-5">
        <FeaturedCarouselSection products={data.featuredProducts} />
      </div>

      <div className="mt-1.5 space-y-1.5 sm:mt-2 sm:space-y-2">
        <MarketplaceHeroSection />
        <DiscoveryListsSection marketplace={data.marketplace} />
        <ExploreMarketplaceSection />
        <TrustStripSection />
      </div>
    </div>
  );
}
