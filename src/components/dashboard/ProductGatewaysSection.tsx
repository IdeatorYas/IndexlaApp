import type { ProductGatewayStats } from "@/lib/domain/dashboard";
import { ProductGatewayCard } from "@/components/dashboard/ProductGatewayCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercent } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function ProductGatewaysSection({
  gateways,
}: {
  gateways: ProductGatewayStats;
}) {
  return (
    <section>
      <SectionHeader
        title="Product Gateways"
        description="Discover indexes, portfolios and every core INDEXLA product area."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ProductGatewayCard
          accent="violet"
          title="Discover"
          href={APP_ROUTES.discover}
          cta="Discover"
        >
          <p>{gateways.discover.tabPreview.join(" · ")}</p>
          <p>{gateways.discover.productCount} public products</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="blue"
          title="Indexes"
          href={`${APP_ROUTES.discover}?tab=indexes`}
          cta="Browse Indexes"
        >
          <p>{gateways.indexes.count} public indexes</p>
          <p>Top · {gateways.indexes.topName}</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="indigo"
          title="Portfolios"
          href={`${APP_ROUTES.discover}?tab=portfolios`}
          cta="Browse Portfolios"
        >
          <p>{gateways.portfolios.count} public portfolios</p>
          <p>Top · {gateways.portfolios.topName}</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="magenta"
          title="Degen Club"
          href={APP_ROUTES.degenClub}
          cta="Enter Degen Club"
        >
          <p className="font-semibold text-app-ink">
            {gateways.degenClub.tagline}
          </p>
          <p>{gateways.degenClub.indexCount} memecoin indexes</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="emerald"
          title="Strategies"
          href={APP_ROUTES.strategies}
          cta="Explore Strategies"
        >
          <p>{gateways.strategies.available} available</p>
          <p>{gateways.strategies.active} active on your portfolios</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="amber"
          title="Leaderboard"
          href={APP_ROUTES.leaderboard}
          cta="View Leaderboard"
        >
          <p>{gateways.leaderboard.topTenMessage}</p>
          {gateways.leaderboard.userBestRank ? (
            <p>Your best portfolio rank · #{gateways.leaderboard.userBestRank}</p>
          ) : (
            <p>No ranked portfolio yet</p>
          )}
          <ul className="mt-1 space-y-0.5 text-xs">
            {gateways.leaderboard.topThree.map((entry) => (
              <li key={entry.portfolioId}>
                #{entry.rank} {entry.portfolioName} ·{" "}
                {formatPercent(entry.performance30d, true)}
              </li>
            ))}
          </ul>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="indigo"
          title="Creators"
          href={gateways.creatorHub.href}
          cta="Open Creator Hub"
        >
          <p>{gateways.creatorHub.statusLabel}</p>
          <p>{gateways.creatorHub.creatorCount} creators on INDEXLA</p>
        </ProductGatewayCard>

        <ProductGatewayCard
          accent="blue"
          title="My Portfolio"
          href={APP_ROUTES.portfolio}
          cta="Open Portfolio"
        >
          <p>{gateways.myPortfolio.activePortfolios} active portfolios</p>
          <p>{gateways.myPortfolio.assetCount} underlying assets</p>
          <p>
            30D · {formatPercent(gateways.myPortfolio.return30d, true)}
          </p>
          <p>{gateways.myPortfolio.automationStatus}</p>
        </ProductGatewayCard>
      </div>
    </section>
  );
}
