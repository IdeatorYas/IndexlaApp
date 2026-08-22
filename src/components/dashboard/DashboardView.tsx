"use client";

import { ActivePortfoliosSection } from "@/components/dashboard/ActivePortfoliosSection";
import { AutomationStatusSection } from "@/components/dashboard/AutomationStatusSection";
import { MarketSnapshotSection } from "@/components/dashboard/MarketSnapshotSection";
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
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-app-brand">
        Dashboard
      </p>
      <h1 className="app-display text-2xl font-bold text-app-ink md:text-3xl">
        Welcome back, {nickname}
      </h1>
      <p className="max-w-3xl text-sm text-app-muted md:text-base">
        Your portfolios, automation and opportunities—all in one place.
      </p>
    </header>
  );
}

export function DashboardView() {
  const { wallet, loadState, connectDemo, retryLoad } = useDemoWallet();
  const baseData = getDashboardFixture();
  const data =
    wallet.state === "connected" && loadState === "ready"
      ? baseData
      : wallet.state === "connected" && loadState === "loading"
        ? baseData
        : wallet.state === "connected" && loadState === "error"
          ? baseData
          : baseData;

  const activePortfolios = getActivePortfolios(data.activePortfolioIds);

  const activityItems =
    wallet.state === "connected" && loadState === "ready"
      ? data.recentActivity
      : [];

  return (
    <div className="space-y-8">
      <DashboardHeader nickname={data.nickname} />

      <PortfolioOverviewSection
        overview={data.overview}
        wallet={wallet}
        loadState={loadState}
        onConnect={connectDemo}
        onRetry={retryLoad}
      />

      <ProductGatewaysSection gateways={data.gateways} />

      <ActivePortfoliosSection portfolios={activePortfolios} />

      <div className="grid gap-6 xl:grid-cols-2">
        <AutomationStatusSection automation={data.automation} />
        <RecentActivitySection items={activityItems} />
      </div>

      <MarketSnapshotSection market={data.market} />
    </div>
  );
}
