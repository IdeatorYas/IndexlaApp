import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  CreatorActivityItem,
  CreatorDirectoryEntry,
  CreatorPublicProduct,
  CreatorPublicProfile,
  CreatorPublicStrategy,
  CreatorSocialLink,
} from "@/lib/domain/creators";
import {
  getCreatorsWorkspace,
} from "@/lib/fixtures/creators";
import { APP_ROUTES } from "@/lib/routes";

function series(
  base: number,
  drift: number,
  points = 30,
): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  const start = new Date("2026-08-22T16:00:00.000Z");
  for (let i = points - 1; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(base + (points - i) * drift + Math.sin(i / 3) * base * 0.03),
    });
  }
  return out;
}

const ASSET_SETS: Array<Array<{ assetId: string; label: string; percent: number }>> = [
  [
    { assetId: "btc", label: "BTC", percent: 40 },
    { assetId: "eth", label: "ETH", percent: 35 },
    { assetId: "sol", label: "SOL", percent: 25 },
  ],
  [
    { assetId: "eth", label: "ETH", percent: 55 },
    { assetId: "btc", label: "BTC", percent: 45 },
  ],
  [
    { assetId: "sol", label: "SOL", percent: 50 },
    { assetId: "wif", label: "WIF", percent: 25 },
    { assetId: "bonk", label: "BONK", percent: 25 },
  ],
  [
    { assetId: "eth", label: "ETH", percent: 60 },
    { assetId: "sol", label: "SOL", percent: 40 },
  ],
];

const PRODUCT_NAMES = [
  "Core Index",
  "Growth Portfolio",
  "Satellite Basket",
  "Income Overlay",
  "Momentum Sleeve",
];

const STRATEGY_NAMES = [
  "Weekly Rebalance",
  "Momentum Overlay",
  "Risk Guardrails",
  "Sentiment Trim",
];

function socialsFor(handle: string, verified: boolean): CreatorSocialLink[] {
  const links: CreatorSocialLink[] = [
    {
      platform: "X",
      label: `@${handle}`,
      url: `https://x.com/${handle}`,
    },
    {
      platform: "Website",
      label: "Creator site",
      url: `https://indexla.tech/creators/${handle}`,
    },
  ];
  if (verified) {
    links.push({
      platform: "Discord",
      label: "Community",
      url: `https://discord.gg/${handle}`,
    });
  }
  return links;
}

function riskForSpecialty(specialty: string): ProductRisk {
  if (specialty === "Degen") return "Extreme";
  if (specialty === "AI" || specialty === "Crypto") return "High";
  if (specialty === "RWAs" || specialty === "Commodities") return "Medium";
  return "Medium";
}

function buildProducts(creator: CreatorDirectoryEntry): CreatorPublicProduct[] {
  const count = Math.max(1, creator.publicProductCount);
  const products: CreatorPublicProduct[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${creator.handle}-product-${i + 1}`;
    const kind = i % 2 === 0 ? "Index" : "Portfolio";
    const aumShare = creator.totalAumUsd / count;
    const perf =
      Math.round(
        (creator.bestPerformancePercent - i * 2.1 + (i % 2 === 0 ? 0.8 : -1.2)) *
          10,
      ) / 10;
    const rank =
      i === 0 && creator.discoveryRank <= 20
        ? creator.discoveryRank + i
        : i === 0
          ? null
          : creator.discoveryRank + 8 + i;
    products.push({
      id,
      name: `${creator.displayName} ${PRODUCT_NAMES[i % PRODUCT_NAMES.length]}`,
      kind,
      verified: creator.verified,
      thesis: `${creator.specialty} thesis · ${creator.bio}`,
      strategy: STRATEGY_NAMES[i % STRATEGY_NAMES.length],
      risk: riskForSpecialty(creator.specialty),
      networkIds: creator.networkIds.slice(0, Math.min(3, creator.networkIds.length)),
      allocations: ASSET_SETS[i % ASSET_SETS.length],
      aumUsd: Math.round(aumShare * (1 - i * 0.08)),
      volumeUsd: Math.round(aumShare * 0.35 * (1.1 - i * 0.05)),
      investors: Math.max(
        8,
        Math.round(creator.investorsCopiers / count) - i * 3,
      ),
      performance30d: perf,
      likes: Math.round(creator.followerCount * 0.08) + i * 12,
      portfolioLeaderboardRank: rank && rank <= 25 ? rank : null,
      href: `${APP_ROUTES.discover}?id=${id}`,
      isIllustrative: true,
    });
  }
  return products;
}

function buildStrategies(
  creator: CreatorDirectoryEntry,
): CreatorPublicStrategy[] {
  const count = creator.verified ? 2 : 1;
  const list: CreatorPublicStrategy[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${creator.handle}-strategy-${i + 1}`;
    const paid = !creator.verified || i === 1;
    list.push({
      id,
      name: `${STRATEGY_NAMES[i % STRATEGY_NAMES.length]} · ${creator.displayName}`,
      logicSummary:
        i === 0
          ? "Rebalance when any sleeve drifts beyond configured thresholds."
          : "Rotate into relative-strength leaders; exit on trend break.",
      riskLevel:
        creator.specialty === "Degen"
          ? "extreme"
          : creator.specialty === "AI"
            ? "high"
            : "medium",
      compatibleAssets: ASSET_SETS[i % ASSET_SETS.length].map((a) => a.label),
      networkIds: creator.networkIds,
      performance30d:
        Math.round((creator.bestPerformancePercent * 0.55 - i * 1.4) * 10) / 10,
      activePortfolios: Math.max(2, Math.round(creator.publicProductCount * 4) - i),
      accessPriceDexla: paid ? 1_500 + i * 500 : null,
      href: `${APP_ROUTES.strategies}?focus=${id}`,
      isIllustrative: true,
    });
  }
  return list;
}

function buildActivity(
  creator: CreatorDirectoryEntry,
  products: CreatorPublicProduct[],
  strategies: CreatorPublicStrategy[],
): CreatorActivityItem[] {
  const items: CreatorActivityItem[] = [];
  const base = new Date("2026-08-20T12:00:00.000Z");
  products.slice(0, 2).forEach((p, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 3);
    items.push({
      id: `${creator.handle}-act-prod-${i}`,
      title: "New portfolio published",
      subtitle: `${p.name} · Illustrative`,
      atIso: d.toISOString(),
      kind: "product",
      isIllustrative: true,
    });
  });
  strategies.slice(0, 1).forEach((s, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - 5 - i);
    items.push({
      id: `${creator.handle}-act-strat-${i}`,
      title: "Strategy published",
      subtitle: `${s.name} · Illustrative`,
      atIso: d.toISOString(),
      kind: "strategy",
      isIllustrative: true,
    });
  });
  const upd = new Date(base);
  upd.setDate(upd.getDate() - 1);
  items.push({
    id: `${creator.handle}-act-upd`,
    title: "Portfolio update",
    subtitle: "Allocation drift review · Illustrative",
    atIso: upd.toISOString(),
    kind: "update",
    isIllustrative: true,
  });
  return items.sort(
    (a, b) => new Date(b.atIso).getTime() - new Date(a.atIso).getTime(),
  );
}

function buildProfile(creator: CreatorDirectoryEntry): CreatorPublicProfile {
  const products = buildProducts(creator);
  const strategies = buildStrategies(creator);
  const totalVolume = products.reduce((s, p) => s + p.volumeUsd, 0);
  const totalLikes = products.reduce((s, p) => s + p.likes, 0);
  const bestRank = products
    .map((p) => p.portfolioLeaderboardRank)
    .filter((r): r is number => r != null)
    .sort((a, b) => a - b)[0] ?? null;

  return {
    handle: creator.handle,
    displayName: creator.displayName,
    bio: creator.bio,
    avatarInitials: creator.avatarInitials,
    avatarHue: creator.avatarHue,
    verified: creator.verified,
    specialty: creator.specialty,
    creatorSince: creator.creatorSince,
    socials: socialsFor(creator.handle, creator.verified),
    followerCount: creator.followerCount,
    notificationSubscriberCount: creator.notificationSubscriberCount,
    totalAumUsd: creator.totalAumUsd,
    totalVolumeUsd: totalVolume,
    investorsCopiers: creator.investorsCopiers,
    liveProductCount: products.length,
    bestPortfolioLeaderboardRank: bestRank,
    bestPerformancePercent: creator.bestPerformancePercent,
    totalLikes,
    growthPercent: creator.growthPercent,
    initiallyFollowing: creator.initiallyFollowing,
    initiallyNotify: creator.initiallyNotify,
    products,
    strategies,
    performanceSeries: series(100, creator.bestPerformancePercent / 40),
    aumSeries: series(creator.totalAumUsd * 0.7, creator.totalAumUsd * 0.01),
    investorSeries: series(
      creator.investorsCopiers * 0.65,
      creator.investorsCopiers * 0.012,
    ),
    activity: buildActivity(creator, products, strategies),
    disclosures: [
      "Likes and follows are engagement metrics only and never affect Portfolio Leaderboard ranking.",
      "All AUM, performance, volume and activity figures on this profile are Illustrative.",
      "Paid strategy access is creator-to-creator via Strategies; investors use strategies through portfolios.",
    ],
    marketDataStale: true,
    isIllustrative: true,
  };
}

const PROFILE_CACHE: Map<string, CreatorPublicProfile> = new Map();

function ensureCache(): void {
  if (PROFILE_CACHE.size > 0) return;
  for (const creator of getCreatorsWorkspace().creators) {
    PROFILE_CACHE.set(creator.handle.toLowerCase(), buildProfile(creator));
  }
}

export function getCreatorPublicProfile(
  handle: string,
): CreatorPublicProfile | null {
  ensureCache();
  return PROFILE_CACHE.get(handle.toLowerCase()) ?? null;
}

export function getAllCreatorPublicHandles(): string[] {
  return getCreatorsWorkspace().creators.map((c) => c.handle);
}
