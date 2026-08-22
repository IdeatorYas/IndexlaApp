import type { ChartPeriod } from "@/lib/domain/dashboard";
import type {
  MyPortfolioDetail,
  MyPortfolioWorkspace,
  OwnedPortfolioSummary,
  PortfolioActivityItem,
  PortfolioAssetRow,
} from "@/lib/domain/my-portfolio";
import type { NetworkId, Portfolio } from "@/lib/domain/types";
import { getIllustrativeChartSeries } from "@/lib/fixtures/chart-series";
import {
  ILLUSTRATIVE_DEXLA,
  ILLUSTRATIVE_PORTFOLIOS,
} from "@/lib/fixtures/index";

const OWNED_IDS = ["ai-infra-index", "macro-diversified", "degen-ten-shots"] as const;

const VISIBILITY: Record<string, "personal" | "public"> = {
  "ai-infra-index": "public",
  "macro-diversified": "personal",
  "degen-ten-shots": "public",
};

const NETWORK_LABELS: Record<NetworkId, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  bnb: "BNB Chain",
  solana: "Solana",
  sui: "Sui",
  robinhood: "Robinhood",
};

function ownedPortfolio(p: Portfolio): OwnedPortfolioSummary {
  return {
    id: p.id,
    name: p.name,
    kind: p.discoveryLabel,
    visibility: VISIBILITY[p.id] ?? "personal",
    status: p.automationActive ? "active" : "paused",
    valueUsd: p.valueUsd,
    performance30d: p.performance30d,
    isIllustrative: p.isIllustrative,
  };
}

function buildAssets(p: Portfolio): PortfolioAssetRow[] {
  const network = p.networkIds[0] ?? "ethereum";
  return p.assets.map((a, index) => {
    const valueUsd = (p.valueUsd * a.percent) / 100;
    const price =
      a.assetId === "btc"
        ? 77_260
        : a.assetId === "eth"
          ? 2_427
          : a.assetId === "sol"
            ? 94.35
            : a.assetId === "wif"
              ? 0.72
              : 10;
    const target = a.percent;
    const current = a.percent + (index === 0 ? 1.4 : index === 1 ? -0.9 : -0.5);
    return {
      id: `${p.id}-${a.assetId}`,
      assetId: a.assetId,
      symbol: a.label,
      name: a.label,
      networkId: p.networkIds[index % p.networkIds.length] ?? network,
      balance: valueUsd / price,
      valueUsd,
      allocationPercent: Math.round(current * 10) / 10,
      targetPercent: target,
      driftPercent: Math.round((current - target) * 10) / 10,
      performance24h: index % 2 === 0 ? 1.2 : -0.8,
      performanceTotal: p.performance30d / 2 + index,
    };
  });
}

function buildActivity(p: Portfolio): PortfolioActivityItem[] {
  const base: PortfolioActivityItem[] = [
    {
      id: `${p.id}-buy`,
      type: "buy",
      title: "Buy",
      assetLabel: p.assets[0]?.label ?? "ETH",
      amountUsd: 1_250,
      amountDexla: null,
      status: "confirmed",
      timestamp: "2026-08-22T14:20:00.000Z",
      provider: "cow",
      mevStatus: "protected",
      routingStatus: "CoW batch settled (illustrative)",
      gasUsd: 3.2,
      bridgeUsd: 0,
      routingUsd: 0.4,
      executionFeeUsd: 12.5,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-buy",
      isIllustrative: true,
    },
    {
      id: `${p.id}-rebalance`,
      type: "rebalance",
      title: "Rebalance",
      assetLabel: "Multi-asset",
      amountUsd: null,
      amountDexla: null,
      status: "confirmed",
      timestamp: "2026-08-21T19:40:00.000Z",
      provider: "lifi",
      mevStatus: "not-applicable",
      routingStatus: "LI.FI route preview",
      gasUsd: 4.1,
      bridgeUsd: 0,
      routingUsd: 1.1,
      executionFeeUsd: 8.4,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-rebalance",
      isIllustrative: true,
    },
    {
      id: `${p.id}-dca`,
      type: "dca",
      title: "DCA execution",
      assetLabel: p.assets[1]?.label ?? "BTC",
      amountUsd: 200,
      amountDexla: null,
      status: "confirmed",
      timestamp: "2026-08-21T08:05:00.000Z",
      provider: "cow",
      mevStatus: "protected",
      routingStatus: "CoW intent (illustrative)",
      gasUsd: 1.8,
      bridgeUsd: 0,
      routingUsd: 0.2,
      executionFeeUsd: 2.0,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-dca",
      isIllustrative: true,
    },
    {
      id: `${p.id}-swap`,
      type: "swap",
      title: "Swap",
      assetLabel: `${p.assets[0]?.label ?? "ETH"} → ${p.assets[1]?.label ?? "BTC"}`,
      amountUsd: 420,
      amountDexla: null,
      status: "confirmed",
      timestamp: "2026-08-20T16:10:00.000Z",
      provider: "cow",
      mevStatus: "protected",
      routingStatus: "CoW MEV-aware",
      gasUsd: 2.4,
      bridgeUsd: 0,
      routingUsd: 0.3,
      executionFeeUsd: 4.2,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-swap",
      isIllustrative: true,
    },
    {
      id: `${p.id}-bridge`,
      type: "bridge",
      title: "Bridge",
      assetLabel: p.assets[0]?.label ?? "ETH",
      amountUsd: 800,
      amountDexla: null,
      status: "delayed",
      timestamp: "2026-08-20T11:00:00.000Z",
      provider: "across",
      mevStatus: "not-applicable",
      routingStatus: "Across fill pending (illustrative)",
      gasUsd: 1.1,
      bridgeUsd: 3.8,
      routingUsd: 0.6,
      executionFeeUsd: 8.0,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-bridge",
      isIllustrative: true,
    },
    {
      id: `${p.id}-sell`,
      type: "sell",
      title: "Sell",
      assetLabel: p.assets[p.assets.length - 1]?.label ?? "SOL",
      amountUsd: 150,
      amountDexla: null,
      status: "confirmed",
      timestamp: "2026-08-19T13:25:00.000Z",
      provider: "lifi",
      mevStatus: "unknown",
      routingStatus: "LI.FI swap route",
      gasUsd: 2.0,
      bridgeUsd: 0,
      routingUsd: 0.5,
      executionFeeUsd: 1.5,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-sell",
      isIllustrative: true,
    },
    {
      id: `${p.id}-tip`,
      type: "tip",
      title: "Creator tip",
      assetLabel: `@${p.creatorHandle ?? "indexla"}`,
      amountUsd: null,
      amountDexla: 250,
      status: "confirmed",
      timestamp: "2026-08-18T11:15:00.000Z",
      provider: "none",
      mevStatus: "not-applicable",
      routingStatus: "Off-route tip (illustrative)",
      gasUsd: 0.4,
      bridgeUsd: 0,
      routingUsd: 0,
      executionFeeUsd: 0,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-tip",
      isIllustrative: true,
    },
    {
      id: `${p.id}-strategy`,
      type: "strategy-access",
      title: "Strategy access",
      assetLabel: "Momentum Alpha",
      amountUsd: null,
      amountDexla: 1_500,
      status: "pending",
      timestamp: "2026-08-17T16:30:00.000Z",
      provider: "none",
      mevStatus: "not-applicable",
      routingStatus: "Marketplace access preview",
      gasUsd: 0,
      bridgeUsd: 0,
      routingUsd: 0,
      executionFeeUsd: 0,
      txLinkPlaceholder: "https://example.invalid/tx/illustrative-strategy",
      isIllustrative: true,
    },
  ];
  return base;
}

function buildDetail(p: Portfolio): MyPortfolioDetail {
  const summary = ownedPortfolio(p);
  const assets = buildAssets(p);
  const investedUsd = Math.round(p.valueUsd * 0.86);
  const allTimePnlUsd = p.valueUsd - investedUsd;
  const chartSeries = getIllustrativeChartSeries(p.valueUsd);
  const periodPerformance: Record<ChartPeriod, number> = {
    "7d": Math.round(p.performance30d * 0.25 * 10) / 10,
    "30d": p.performance30d,
    "90d": Math.round(p.performance30d * 1.6 * 10) / 10,
    "1y": Math.round(p.performance30d * 2.4 * 10) / 10,
  };

  const networkAllocations = p.networkIds.map((networkId, index) => {
    const percent =
      Math.floor(100 / p.networkIds.length) +
      (index === 0 ? 100 % p.networkIds.length : 0);
    return {
      networkId,
      label: NETWORK_LABELS[networkId],
      percent,
      valueUsd: (p.valueUsd * percent) / 100,
    };
  });

  const permissionHealth =
    p.id === "macro-diversified"
      ? "expiring"
      : p.automationActive
        ? "healthy"
        : "expired";

  return {
    summary,
    portfolio: p,
    investedUsd,
    availableUsd: 4_000,
    allTimePnlUsd,
    allTimePnlPercent:
      Math.round((allTimePnlUsd / Math.max(investedUsd, 1)) * 1000) / 10,
    periodPerformance,
    chartSeries,
    assets,
    networkAllocations,
    riskSummary:
      p.id === "degen-ten-shots"
        ? "Extreme speculative exposure — memecoin concentration."
        : "Balanced rules-based exposure with automation limits.",
    riskLevel:
      p.id === "degen-ten-shots"
        ? "Extreme"
        : p.performance30d > 15
          ? "Medium"
          : "Low",
    automation: {
      strategyName: p.strategyName,
      status: p.automationActive ? "active" : "paused",
      condition:
        p.strategyName === "Buy Fear / Sell Greed"
          ? "Fear & Greed < 30 or > 70"
          : "Allocation drift > 3%",
      action:
        p.strategyName === "Buy Fear / Sell Greed"
          ? "Buy underweight / trim overweight"
          : "Rebalance to target weights",
      frequency: "On trigger · weekly check",
      nextExecutionAt: p.automationActive
        ? "2026-08-23T02:00:00.000Z"
        : null,
      lastExecutionAt: "2026-08-21T19:40:00.000Z",
      slippageBps: 50,
      tradeLimitUsd: 2_500,
      dailyLimitUsd: 5_000,
      expiry: "2026-09-30",
      circuitBreaker: true,
      permissionScope:
        "Swap + rebalance on selected assets/networks · spending capped",
      permissionHealth,
      permissionExpiresAt:
        permissionHealth === "expired"
          ? "2026-08-15T00:00:00.000Z"
          : "2026-09-30T00:00:00.000Z",
    },
    activity: buildActivity(p),
    estimatedSaveUsd: Math.round(p.valueUsd * 0.0012),
    rewards: {
      eligible: p.rankMonthly != null && p.rankMonthly <= 10,
      claimableUsd:
        p.rankMonthly != null && p.rankMonthly <= 10 ? 186 : null,
      rankHint:
        p.rankMonthly != null
          ? `Monthly rank #${p.rankMonthly}`
          : "Unranked this month",
    },
    marketDataStale: p.id === "macro-diversified",
  };
}

export function getMyPortfolioWorkspace(): MyPortfolioWorkspace {
  const owned = ILLUSTRATIVE_PORTFOLIOS.filter((p) =>
    OWNED_IDS.includes(p.id as (typeof OWNED_IDS)[number]),
  );
  const detailsById: Record<string, MyPortfolioDetail> = {};
  for (const p of owned) {
    detailsById[p.id] = buildDetail(p);
  }

  return {
    portfolios: owned.map(ownedPortfolio),
    detailsById,
    notifications: [
      {
        id: "n-exec",
        category: "execution",
        title: "Execution update",
        body: "Rebalance for AI Infrastructure Index confirmed (illustrative).",
        createdAt: "2026-08-22T15:00:00.000Z",
        unread: true,
        actionable: "none",
      },
      {
        id: "n-drift",
        category: "drift",
        title: "Allocation drift",
        body: "ETH allocation drifted +1.4% from target.",
        createdAt: "2026-08-22T12:20:00.000Z",
        unread: true,
        actionable: "none",
      },
      {
        id: "n-auto",
        category: "automation",
        title: "Automation trigger",
        body: "Buy Fear condition approaching threshold.",
        createdAt: "2026-08-22T10:00:00.000Z",
        unread: false,
        actionable: "none",
      },
      {
        id: "n-perm",
        category: "permission",
        title: "Permission expiry",
        body: "Macro Diversified Index session expires in 9 days.",
        createdAt: "2026-08-21T18:00:00.000Z",
        unread: true,
        actionable: "review-permission",
      },
      {
        id: "n-gas",
        category: "gas",
        title: "Insufficient gas",
        body: "Base gas balance may be too low for next automation.",
        createdAt: "2026-08-21T09:30:00.000Z",
        unread: false,
        actionable: "none",
      },
      {
        id: "n-reward",
        category: "reward",
        title: "Reward eligibility",
        body: "You are in the Top 10 zone this month.",
        createdAt: "2026-08-20T16:00:00.000Z",
        unread: true,
        actionable: "claim-rewards",
      },
      {
        id: "n-creator",
        category: "creator",
        title: "Creator publication",
        body: "@memebuilder published a new public portfolio.",
        createdAt: "2026-08-20T11:00:00.000Z",
        unread: false,
        actionable: "none",
      },
      {
        id: "n-sec",
        category: "security",
        title: "Security alert",
        body: "No unusual permission requests detected in the last 7 days.",
        createdAt: "2026-08-19T08:00:00.000Z",
        unread: false,
        actionable: "none",
      },
    ],
    notificationPrefs: {
      executionUpdates: true,
      allocationDrift: true,
      automationTriggers: true,
      permissionExpiry: true,
      insufficientGas: true,
      rewardEligibility: true,
      creatorPublications: true,
      securityAlerts: true,
    },
    dexla: { ...ILLUSTRATIVE_DEXLA },
    isIllustrative: true,
  };
}

export function getEmptyMyPortfolioWorkspace(): MyPortfolioWorkspace {
  const base = getMyPortfolioWorkspace();
  return {
    ...base,
    portfolios: [],
    detailsById: {},
    notifications: [],
  };
}
