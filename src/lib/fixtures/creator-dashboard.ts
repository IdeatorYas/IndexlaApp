import type {
  CreatorDashboardLiveProduct,
  CreatorDashboardWorkspace,
} from "@/lib/domain/creator-dashboard";
import { getCreatorPublicProfile } from "@/lib/fixtures/creator-profile";
import { getStrategiesWorkspace } from "@/lib/fixtures/strategies";

function series(base: number, drift: number, points = 30): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  const start = new Date("2026-08-22T16:00:00.000Z");
  for (let i = points - 1; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(
        base + (points - i) * drift + Math.sin(i / 3) * base * 0.04,
      ),
    });
  }
  return out;
}

function buildLiveProducts(
  handle: string,
): CreatorDashboardLiveProduct[] {
  const profile = getCreatorPublicProfile(handle);
  if (!profile) return [];
  return profile.products.map((product, index) => ({
    ...product,
    tipsDexla: Math.round(120 + index * 85 + product.likes * 0.4),
    generatedFeesUsd: Math.round(product.aumUsd * 0.0045),
    creatorEarningsUsd: Math.round(product.aumUsd * 0.0022),
    availableBalanceUsd: Math.round(product.aumUsd * 0.0009),
    featurePlacement: {
      portfolioId: product.id,
      active: index === 0,
      costDexla: 2500,
      durationDays: 7,
      burnPercent: 100,
      remainingMs: index === 0 ? 1000 * 60 * 60 * 24 * 4.2 : null,
    },
  }));
}

/** Default illustrative dashboard for the approved preview creator. */
export function getCreatorDashboardWorkspace(
  handle = "indexla",
): CreatorDashboardWorkspace {
  const profile = getCreatorPublicProfile(handle);
  const strategies = getStrategiesWorkspace().myStrategies.filter(
    (s) => s.origin === "created" || s.creatorRevenueDexla > 0,
  );
  const liveProducts = buildLiveProducts(handle);
  const totalTips = liveProducts.reduce((sum, p) => sum + p.tipsDexla, 0);
  const executionFees = liveProducts.reduce(
    (sum, p) => sum + p.generatedFeesUsd,
    0,
  );
  const creatorEarnings = liveProducts.reduce(
    (sum, p) => sum + p.creatorEarningsUsd,
    0,
  );
  const availableUsd = liveProducts.reduce(
    (sum, p) => sum + p.availableBalanceUsd,
    0,
  );
  const strategyRevenue = strategies.reduce(
    (sum, s) => sum + s.creatorRevenueDexla,
    0,
  );

  const identityHandle = profile?.handle ?? handle;
  const displayName = profile?.displayName ?? "INDEXLA";

  return {
    identity: {
      handle: identityHandle,
      displayName,
      bio:
        profile?.bio ??
        "Illustrative creator dashboard preview for approved creators.",
      avatarInitials: profile?.avatarInitials ?? "IX",
      avatarHue: profile?.avatarHue ?? 210,
      verified: profile?.verified ?? true,
      specialty: profile?.specialty ?? "Hybrid",
      creatorSince: profile?.creatorSince ?? "2025-11-01T00:00:00.000Z",
      socials: [
        {
          platform: "X",
          handle: `@${identityHandle}`,
          profileUrl: `https://x.com/${identityHandle}`,
          connected: true,
        },
        {
          platform: "LinkedIn",
          handle: identityHandle,
          profileUrl: `https://www.linkedin.com/in/${identityHandle}`,
          connected: true,
        },
        {
          platform: "YouTube",
          handle: `@${identityHandle}`,
          profileUrl: `https://youtube.com/@${identityHandle}`,
          connected: true,
        },
      ],
    },
    overview: {
      totalAumUsd: profile?.totalAumUsd ?? 1_240_000,
      volume30dUsd: Math.round((profile?.totalVolumeUsd ?? 420_000) * 0.35),
      followers: profile?.followerCount ?? 12_400,
      notificationSubscribers: profile?.notificationSubscriberCount ?? 3_100,
      investorsCopiers: profile?.investorsCopiers ?? 860,
      liveProductCount: liveProducts.length,
      totalTipsDexla: totalTips,
      portfolioLikes: profile?.totalLikes ?? liveProducts.reduce((s, p) => s + p.likes, 0),
    },
    usdEarnings: {
      totalEarnedUsd: creatorEarnings + 4_200,
      availableUsd,
      claimedUsd: Math.max(creatorEarnings + 4_200 - availableUsd, 0),
      portfolioExecutionFeesUsd: executionFees,
      monthlyCreatorRewardsUsd: 4_200,
      chartSeries: series(availableUsd * 0.55, availableUsd * 0.02),
      monthlyHistory: [
        {
          month: "Jun 2026",
          executionFeesUsd: Math.round(executionFees * 0.28),
          monthlyRewardsUsd: 1_100,
        },
        {
          month: "Jul 2026",
          executionFeesUsd: Math.round(executionFees * 0.34),
          monthlyRewardsUsd: 1_400,
        },
        {
          month: "Aug 2026",
          executionFeesUsd: Math.round(executionFees * 0.38),
          monthlyRewardsUsd: 1_700,
        },
      ],
    },
    dexlaEarnings: {
      totalEarnedDexla: totalTips + strategyRevenue,
      availableDexla: Math.round((totalTips + strategyRevenue) * 0.42),
      claimedDexla: Math.round((totalTips + strategyRevenue) * 0.58),
      tipsDexla: totalTips,
      privateStrategyRevenueDexla: strategyRevenue,
      chartSeries: series(
        (totalTips + strategyRevenue) * 0.4,
        (totalTips + strategyRevenue) * 0.015,
      ),
      monthlyHistory: [
        {
          month: "Jun 2026",
          tipsDexla: Math.round(totalTips * 0.28),
          privateStrategyDexla: Math.round(strategyRevenue * 0.3),
        },
        {
          month: "Jul 2026",
          tipsDexla: Math.round(totalTips * 0.34),
          privateStrategyDexla: Math.round(strategyRevenue * 0.33),
        },
        {
          month: "Aug 2026",
          tipsDexla: Math.round(totalTips * 0.38),
          privateStrategyDexla: Math.round(strategyRevenue * 0.37),
        },
      ],
    },
    liveProducts,
    audience: {
      followerSeries: series(
        (profile?.followerCount ?? 12_000) * 0.7,
        (profile?.followerCount ?? 12_000) * 0.01,
      ),
      notificationSeries: series(
        (profile?.notificationSubscriberCount ?? 3_000) * 0.65,
        40,
      ),
      likesSeries: series((profile?.totalLikes ?? 2_400) * 0.6, 18),
      investorSeries: series(
        (profile?.investorsCopiers ?? 800) * 0.7,
        (profile?.investorsCopiers ?? 800) * 0.012,
      ),
      topRegions: [
        { region: "United States", percent: 28 },
        { region: "United Kingdom", percent: 14 },
        { region: "Singapore", percent: 11 },
        { region: "Germany", percent: 9 },
        { region: "Other", percent: 38 },
      ],
      acquisitionSources: [
        { source: "Creator Hub", percent: 34 },
        { source: "X / Social", percent: 27 },
        { source: "Marketplace Discover", percent: 22 },
        { source: "Direct link", percent: 17 },
      ],
      newInvestorsPercent: 41,
      returningInvestorsPercent: 59,
    },
    leaderboardRows: liveProducts.map((product, index) => {
      const rank = product.portfolioLeaderboardRank;
      return {
        productId: product.id,
        productName: product.name,
        kind: product.kind,
        rank,
        points: rank
          ? Math.round(9200 - (rank - 1) * 310 - index * 40)
          : Math.round(1800 - index * 120),
        performanceContribution: 42,
        aumContribution: 28,
        volumeContribution: 18,
        tipsContribution: 12,
        distanceToTop10:
          rank == null ? 10 : rank <= 10 ? 0 : rank - 10,
        monthlyResetDays: 9,
      };
    }),
    strategies: strategies.length
      ? strategies
      : getStrategiesWorkspace().myStrategies.slice(0, 2),
    executionFeeSharePercent:
      getStrategiesWorkspace().defaultExecutionFeeSharePercent,
    activity: profile?.activity ?? [],
    marketDataStale: true,
    isIllustrative: true,
  };
}

export function getEmptyCreatorDashboardWorkspace(): CreatorDashboardWorkspace {
  const base = getCreatorDashboardWorkspace("indexla");
  return {
    ...base,
    overview: {
      ...base.overview,
      liveProductCount: 0,
      totalTipsDexla: 0,
      portfolioLikes: 0,
    },
    liveProducts: [],
    leaderboardRows: [],
    strategies: [],
    usdEarnings: {
      ...base.usdEarnings,
      totalEarnedUsd: 0,
      availableUsd: 0,
      claimedUsd: 0,
      portfolioExecutionFeesUsd: 0,
      monthlyCreatorRewardsUsd: 0,
      monthlyHistory: [],
      chartSeries: series(0, 0, 7),
    },
    dexlaEarnings: {
      ...base.dexlaEarnings,
      totalEarnedDexla: 0,
      availableDexla: 0,
      claimedDexla: 0,
      tipsDexla: 0,
      privateStrategyRevenueDexla: 0,
      monthlyHistory: [],
      chartSeries: series(0, 0, 7),
    },
    activity: [],
  };
}
