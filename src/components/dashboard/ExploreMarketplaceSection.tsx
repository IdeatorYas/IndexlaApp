"use client";

import { getDiscoverCatalog } from "@/lib/data";
import { MarketplaceExplorer } from "@/components/marketplace/MarketplaceExplorer";

export function ExploreMarketplaceSection() {
  const catalog = getDiscoverCatalog().data;

  return (
    <MarketplaceExplorer
      catalog={catalog}
      variant="dashboard"
      maxProducts={6}
    />
  );
}
