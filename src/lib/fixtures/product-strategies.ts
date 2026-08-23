import type { ProductSelectedStrategy } from "@/lib/domain/product-strategy";
import type { PerformancePoint } from "@/lib/domain/marketplace";
import type { MarketplaceStrategyTag } from "@/lib/domain/marketplace";

const PERMISSIONS =
  "Automation runs under explicit session permissions you approve in-wallet. INDEXLA cannot expand scope or withdraw funds. Revoke anytime from My Portfolio.";

export const PRODUCT_STRATEGY_LIBRARY: Record<string, ProductSelectedStrategy> = {
  "buy-fear-sell-greed": {
    id: "buy-fear-sell-greed",
    name: "Buy Fear / Sell Greed",
    explanation:
      "INDEXLA core sentiment framework that accumulates during fear regimes and trims during greed extremes.",
    rules: [
      "Scale in when Fear & Greed Index falls below the fear threshold.",
      "Reduce exposure when greed readings exceed the trim band.",
      "Respect portfolio sleeve weights during each rebalance.",
    ],
    triggers: ["Fear & Greed daily close", "Portfolio drift check"],
    thresholds: [
      { label: "Fear entry", value: "< 30" },
      { label: "Greed trim", value: "> 70" },
      { label: "Max single rebalance", value: "15% NAV" },
    ],
    automationStatus: "active",
    permissionsDisclosure: PERMISSIONS,
  },
  "rsi-weekly": {
    id: "rsi-weekly",
    name: "RSI Oversold / Overbought",
    explanation:
      "Weekly RSI bands identify oversold accumulation and overbought reduction windows across index constituents.",
    rules: [
      "Add on weekly RSI below the oversold band.",
      "Trim sleeves when weekly RSI exceeds the overbought band.",
      "Skip execution if quote or bridge routes are stale.",
    ],
    triggers: ["Weekly candle close", "RSI(14) band cross"],
    thresholds: [
      { label: "Oversold", value: "RSI < 30" },
      { label: "Overbought", value: "RSI > 70" },
      { label: "Cooldown", value: "3 days" },
    ],
    automationStatus: "active",
    permissionsDisclosure: PERMISSIONS,
  },
  "tp-sl": {
    id: "tp-sl",
    name: "Take Profit / Stop Loss",
    explanation:
      "Disciplined exit framework with creator-defined profit targets and drawdown stops per sleeve.",
    rules: [
      "Take profit when a sleeve hits its target gain band.",
      "Stop loss triggers on sleeve drawdown beyond the guardrail.",
      "Reallocate proceeds according to published weights after exit.",
    ],
    triggers: ["Mark-to-market price feed", "Sleeve P&L band breach"],
    thresholds: [
      { label: "Take profit", value: "+18%" },
      { label: "Stop loss", value: "-12%" },
      { label: "Trailing review", value: "Daily" },
    ],
    automationStatus: "available",
    permissionsDisclosure: PERMISSIONS,
  },
  "momentum-alpha": {
    id: "momentum-alpha",
    name: "Momentum Trend",
    explanation:
      "Rotates into relative strength leaders and exits when medium-term trend breaks.",
    rules: [
      "Rank constituents by 20-day momentum.",
      "Overweight top quartile within published allocation bands.",
      "Exit sleeve on trend-break signal.",
    ],
    triggers: ["Daily momentum rank", "Trend-break confirmation"],
    thresholds: [
      { label: "Lookback", value: "20 days" },
      { label: "Leader band", value: "Top 25%" },
      { label: "Exit signal", value: "MA cross down" },
    ],
    automationStatus: "active",
    permissionsDisclosure: PERMISSIONS,
  },
  "weekly-rebalance": {
    id: "weekly-rebalance",
    name: "Weekly Rebalance",
    explanation:
      "Keeps the published allocation on cadence when drift exceeds creator thresholds.",
    rules: [
      "Scan sleeve drift every week.",
      "Rebalance when any asset deviates beyond the drift limit.",
      "Route through best available DEX / bridge quotes.",
    ],
    triggers: ["Weekly schedule", "Drift > threshold"],
    thresholds: [
      { label: "Drift trigger", value: "> 3%" },
      { label: "Cadence", value: "Weekly" },
      { label: "Min trade", value: "$25 equiv." },
    ],
    automationStatus: "active",
    permissionsDisclosure: PERMISSIONS,
  },
  "income-harvest": {
    id: "income-harvest",
    name: "Income Harvest",
    explanation:
      "Harvests yield-oriented sleeves and redeploys into underweight allocations monthly.",
    rules: [
      "Collect yield from eligible sleeves monthly.",
      "Redeploy proceeds into underweight targets.",
      "Preserve core allocation bands.",
    ],
    triggers: ["Monthly schedule", "Yield accrual event"],
    thresholds: [
      { label: "Harvest cadence", value: "Monthly" },
      { label: "Min harvest", value: "$50" },
      { label: "Redeploy band", value: "±2%" },
    ],
    automationStatus: "paused",
    permissionsDisclosure: PERMISSIONS,
  },
  "degen-guardrails": {
    id: "degen-guardrails",
    name: "Rebalance",
    explanation:
      "High-volatility basket with hard guardrails and circuit breakers for extreme-risk sleeves.",
    rules: [
      "Cap any single memecoin sleeve at the published maximum.",
      "Pause automation on basket drawdown beyond the circuit breaker.",
      "Manual resume required after pause.",
    ],
    triggers: ["Basket drawdown monitor", "Weight cap breach"],
    thresholds: [
      { label: "Max sleeve", value: "12%" },
      { label: "Circuit breaker", value: "-25%" },
      { label: "Cooldown", value: "24h" },
    ],
    automationStatus: "paused",
    permissionsDisclosure: PERMISSIONS,
  },
  "template-unassigned": {
    id: "template-unassigned",
    name: "No strategy selected",
    explanation:
      "This INDEXLA template publishes allocations only. Select or configure a strategy when you invest or customize.",
    rules: [
      "Published asset weights remain fixed until you customize.",
      "Automation activates only after you choose a strategy at investment time.",
    ],
    triggers: ["Manual investment review"],
    thresholds: [{ label: "Automation", value: "Not pre-configured" }],
    automationStatus: "available",
    permissionsDisclosure: PERMISSIONS,
  },
};

const TAG_BY_STRATEGY: Record<string, MarketplaceStrategyTag> = {
  "buy-fear-sell-greed": "buy-fear-sell-greed",
  "rsi-weekly": "rsi",
  "tp-sl": "tp-sl",
  "momentum-alpha": "momentum",
  "weekly-rebalance": "momentum",
  "income-harvest": "buy-fear-sell-greed",
  "degen-guardrails": "momentum",
  "template-unassigned": "momentum",
};

export function resolveProductStrategy(strategyId: string): ProductSelectedStrategy {
  return (
    PRODUCT_STRATEGY_LIBRARY[strategyId] ??
    PRODUCT_STRATEGY_LIBRARY["buy-fear-sell-greed"]
  );
}

export function strategyTagsForId(strategyId: string): MarketplaceStrategyTag[] {
  const tag = TAG_BY_STRATEGY[strategyId];
  return tag ? [tag] : ["buy-fear-sell-greed"];
}

export function buildPerformanceChart(
  baseValue: number,
  performance30d: number,
): PerformancePoint[] {
  const out: PerformancePoint[] = [];
  const start = new Date("2026-08-22T16:00:00.000Z");
  const dailyDrift = performance30d / 30 / 100;
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const progress = 30 - i;
    const wave = Math.sin(progress / 4) * baseValue * 0.012;
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(baseValue * (1 + dailyDrift * progress) + wave),
    });
  }
  return out;
}

/** Default strategy rotation for crypto index catalog seeding. */
export const INDEX_STRATEGY_ROTATION = [
  "buy-fear-sell-greed",
  "rsi-weekly",
  "momentum-alpha",
  "weekly-rebalance",
  "momentum-alpha",
  "momentum-alpha",
  "income-harvest",
  "rsi-weekly",
  "buy-fear-sell-greed",
  "tp-sl",
  "buy-fear-sell-greed",
  "rsi-weekly",
  "momentum-alpha",
  "weekly-rebalance",
  "momentum-alpha",
  "income-harvest",
  "weekly-rebalance",
  "buy-fear-sell-greed",
  "rsi-weekly",
  "momentum-alpha",
  "income-harvest",
  "weekly-rebalance",
  "momentum-alpha",
  "buy-fear-sell-greed",
  "momentum-alpha",
] as const;

export function strategyIdForIndexOrdinal(index: number): string {
  return INDEX_STRATEGY_ROTATION[index % INDEX_STRATEGY_ROTATION.length];
}
