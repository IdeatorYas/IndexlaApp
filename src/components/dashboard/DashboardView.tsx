"use client";

import { ExploreMarketplaceSection } from "@/components/dashboard/ExploreMarketplaceSection";
import { FeaturedProductsSection } from "@/components/dashboard/FeaturedProductsSection";
import { HowIndexlaWorksSection } from "@/components/dashboard/HowIndexlaWorksSection";
import { MarketplaceHeroSection } from "@/components/dashboard/MarketplaceHeroSection";
import { PersonalSnapshotSection } from "@/components/dashboard/PersonalSnapshotSection";
import { ProductPathwaysSection } from "@/components/dashboard/ProductPathwaysSection";
import { TrustStripSection } from "@/components/dashboard/TrustStripSection";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  getActivePortfolios,
  getDashboardFixture,
} from "@/lib/dashboard/data";

export function DashboardView() {
  const { wallet, loadState, connectDemo, retryLoad } = useDemoWallet();
  const data = getDashboardFixture();
  const activePortfolios = getActivePortfolios(data.activePortfolioIds);
  const activityItems =
    wallet.state === "connected" && loadState === "ready"
      ? data.recentActivity
      : [];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 md:space-y-10">
      <MarketplaceHeroSection />
      <FeaturedProductsSection products={data.featuredProducts} />
      <ExploreMarketplaceSection
        marketplace={data.marketplace}
        categories={data.categories}
      />
      <ProductPathwaysSection pathways={data.pathways} />
      <HowIndexlaWorksSection />
      <PersonalSnapshotSection
        overview={data.overview}
        portfolios={activePortfolios}
        automation={data.automation}
        activity={activityItems}
        wallet={wallet}
        loadState={loadState}
        onConnect={connectDemo}
        onRetry={retryLoad}
      />
      <TrustStripSection />
    </div>
  );
}
