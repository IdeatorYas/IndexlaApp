"use client";

import { ActivePortfoliosSection } from "@/components/dashboard/ActivePortfoliosSection";
import { AutomationStatusSection } from "@/components/dashboard/AutomationStatusSection";
import { FeaturedProductsSection } from "@/components/dashboard/FeaturedProductsSection";
import { MarketSnapshotSection } from "@/components/dashboard/MarketSnapshotSection";
import { NotificationsPreviewSection } from "@/components/dashboard/NotificationsPreviewSection";
import { PortfolioOverviewSection } from "@/components/dashboard/PortfolioOverviewSection";
import { ProductGatewaysSection } from "@/components/dashboard/ProductGatewaysSection";
import { RecentActivitySection } from "@/components/dashboard/RecentActivitySection";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  getActivePortfolios,
  getDashboardFixture,
} from "@/lib/dashboard/data";

export function DashboardHeader({ nickname }: { nickname: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-app-brand">
        Dashboard
      </p>
      <h1 className="app-display text-3xl font-bold tracking-tight text-app-ink md:text-4xl">
        Welcome back,{" "}
        <span className="app-gradient-text">{nickname}</span>
      </h1>
      <p className="max-w-3xl text-sm text-app-muted md:text-base">
        Your portfolios, automation and opportunities—all in one place.
      </p>
    </header>
  );
}

export function DashboardView() {
  const { wallet, loadState, connectDemo, retryLoad } = useDemoWallet();
  const data = getDashboardFixture();
  const activePortfolios = getActivePortfolios(data.activePortfolioIds);
  const activityItems =
    wallet.state === "connected" && loadState === "ready"
      ? data.recentActivity
      : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <DashboardHeader nickname={data.nickname} />

      <PortfolioOverviewSection
        overview={data.overview}
        wallet={wallet}
        loadState={loadState}
        onConnect={connectDemo}
        onRetry={retryLoad}
      />

      <FeaturedProductsSection products={data.featuredProducts} />

      <ProductGatewaysSection gateways={data.gateways} />

      <ActivePortfoliosSection portfolios={activePortfolios} />

      <div className="grid gap-6 xl:grid-cols-3">
        <AutomationStatusSection automation={data.automation} />
        <RecentActivitySection items={activityItems} />
        <NotificationsPreviewSection items={data.notifications} />
      </div>

      <MarketSnapshotSection market={data.market} />
    </div>
  );
}
