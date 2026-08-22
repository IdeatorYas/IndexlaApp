import type { MarketSnapshot } from "@/lib/domain/dashboard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatMarketTimestamp, formatPercent } from "@/lib/dashboard/data";

export function MarketSnapshotSection({ market }: { market: MarketSnapshot }) {
  const up = market.totalMarketTrendDirection === "up";
  const down = market.totalMarketTrendDirection === "down";

  return (
    <section className="app-panel p-5 md:p-6">
      <SectionHeader
        title="Market Snapshot"
        description="Macro context for portfolio decisions."
        illustrative={market.isIllustrative}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          label="Fear & Greed"
          value={String(market.fearGreedIndex)}
          detail={market.fearGreedLabel}
        />
        <Card
          label="BTC dominance"
          value={formatPercent(market.btcDominancePercent)}
          detail="Share of total crypto market"
        />
        <Card
          label="Total crypto market trend"
          value={formatPercent(market.totalMarketTrendPercent, true)}
          detail="24H direction"
          tone={up ? "success" : down ? "danger" : "default"}
        />
      </div>

      <p className="mt-4 text-xs text-app-dim">
        Data as of {formatMarketTimestamp(market.dataTimestamp)}
      </p>
    </section>
  );
}

function Card({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="app-panel-soft p-4">
      <p className="text-xs font-medium text-app-dim">{label}</p>
      <p
        className={[
          "mt-2 text-2xl font-bold",
          tone === "success"
            ? "text-app-success"
            : tone === "danger"
              ? "text-app-danger"
              : "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-app-muted">{detail}</p>
    </div>
  );
}
