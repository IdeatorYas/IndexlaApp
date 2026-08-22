import type { MarketSnapshot } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatMarketTimestamp, formatPercent } from "@/lib/dashboard/data";

export function MarketSnapshotSection({ market }: { market: MarketSnapshot }) {
  const trendPositive = market.totalMarketTrendDirection === "up";
  const trendNegative = market.totalMarketTrendDirection === "down";

  return (
    <section className="app-panel p-5 md:p-6">
      <SectionHeader
        title="Market Snapshot"
        description="Macro context for your portfolio decisions."
        illustrative={market.isIllustrative}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-app-line bg-app-panel/50 p-4">
          <p className="text-xs text-app-dim">Fear & Greed</p>
          <p className="mt-2 text-2xl font-bold text-app-ink">
            {market.fearGreedIndex}
          </p>
          <p className="text-sm text-app-muted">{market.fearGreedLabel}</p>
        </div>

        <div className="rounded-lg border border-app-line bg-app-panel/50 p-4">
          <p className="text-xs text-app-dim">BTC dominance</p>
          <p className="mt-2 text-2xl font-bold text-app-ink">
            {formatPercent(market.btcDominancePercent)}
          </p>
          <p className="text-sm text-app-muted">Share of total crypto market</p>
        </div>

        <div className="rounded-lg border border-app-line bg-app-panel/50 p-4">
          <p className="text-xs text-app-dim">Total crypto market trend</p>
          <p
            className={[
              "mt-2 text-2xl font-bold",
              trendPositive
                ? "text-app-success"
                : trendNegative
                  ? "text-app-danger"
                  : "text-app-ink",
            ].join(" ")}
          >
            {formatPercent(market.totalMarketTrendPercent, true)}
          </p>
          <p className="text-sm text-app-muted">24H direction</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-app-dim">
        Data as of {formatMarketTimestamp(market.dataTimestamp)}
      </p>
    </section>
  );
}
