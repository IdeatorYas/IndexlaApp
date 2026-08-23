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
    <div
      className="mx-auto space-y-4 md:space-y-5"
      style={{ maxWidth: "var(--content-max)" }}
    >
      <FeaturedCarouselSection products={data.featuredProducts} />
      <MarketplaceHeroSection />
      <DiscoveryListsSection marketplace={data.marketplace} />
      <ExploreMarketplaceSection />
      <TrustStripSection />
    </div>
  );
}
