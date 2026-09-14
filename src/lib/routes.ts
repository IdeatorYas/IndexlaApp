import type { AppScreenMeta } from "@/lib/domain/types";

/** Single authority: content/app/INDEXLA_APP_V1_BUILD_PLAN.md route contract */
export const APP_ROUTES = {
  dashboard: "/app",
  discover: "/app/discover",
  degenClub: "/app/degen-club",
  degenProduct: (id: string) => `/app/degen-club/product/${id}`,
  stableClub: "/app/stable-club",
  create: "/app/create",
  portfolio: "/app/portfolio",
  strategies: "/app/strategies",
  leaderboard: "/app/leaderboard",
  creators: "/app/creators",
  creatorLeaderboard: "/app/creators/leaderboard",
  creatorActivate: "/app/creators/activate",
  creatorProfile: (handle: string) => `/app/creators/${handle}`,
  creatorDashboard: "/app/creator-dashboard",
  product: (id: string) => `/app/product/${id}`,
  utilityIndex: "/app/utility-index",
} as const;

export const NAV_ITEMS = [
  { href: APP_ROUTES.dashboard, label: "INDEXLA Core", shortLabel: "Core" },
  { href: APP_ROUTES.stableClub, label: "Stable Club", shortLabel: "Stable" },
  { href: APP_ROUTES.degenClub, label: "Degen Club", shortLabel: "Degen" },
  { href: APP_ROUTES.create, label: "Create Portfolio / Index", shortLabel: "Create" },
  { href: APP_ROUTES.portfolio, label: "My Portfolio", shortLabel: "Portfolio" },
  { href: APP_ROUTES.strategies, label: "Strategies", shortLabel: "Strategies" },
  { href: APP_ROUTES.leaderboard, label: "Leaderboard", shortLabel: "Leaderboard" },
  { href: APP_ROUTES.creators, label: "Creators", shortLabel: "Creators" },
] as const;

export const APP_SCREENS: AppScreenMeta[] = [
  {
    number: 1,
    slug: "dashboard",
    title: "Marketplace-First Dashboard",
    route: APP_ROUTES.dashboard,
    purpose: "Product discovery home for every user, with personal data secondary.",
  },
  {
    number: 2,
    slug: "discover",
    title: "Discover",
    route: APP_ROUTES.discover,
    purpose: "Browse all public INDEXLA investment products.",
  },
  {
    number: 3,
    slug: "degen-club",
    title: "Degen Club",
    route: APP_ROUTES.degenClub,
    purpose: "Discover and build diversified memecoin portfolios/indexes.",
  },
  {
    number: 4,
    slug: "create",
    title: "Create Portfolio / Index",
    route: APP_ROUTES.create,
    purpose: "Guided builder for portfolio or rules-based index.",
  },
  {
    number: 5,
    slug: "portfolio",
    title: "My Portfolio",
    route: APP_ROUTES.portfolio,
    purpose: "Personal ownership, automation and activity center.",
  },
  {
    number: 6,
    slug: "strategies",
    title: "Strategies",
    route: APP_ROUTES.strategies,
    purpose: "Strategy Marketplace, My Strategies and publishing.",
  },
  {
    number: 7,
    slug: "leaderboard",
    title: "Portfolio Leaderboard",
    route: APP_ROUTES.leaderboard,
    purpose: "Rank public portfolios/indexes for monthly rewards.",
  },
  {
    number: 8,
    slug: "creators",
    title: "Browse Creators",
    route: APP_ROUTES.creators,
    purpose: "Entry point to the Creator Hub.",
  },
  {
    number: 9,
    slug: "creator-leaderboard",
    title: "Creator Leaderboard",
    route: APP_ROUTES.creatorLeaderboard,
    purpose: "Rank creator profiles separately from portfolio rewards.",
  },
  {
    number: 10,
    slug: "creator-profile",
    title: "Public Creator Profile",
    route: "/app/creators/{handle}",
    purpose: "Public creator identity and product storefront.",
  },
  {
    number: 11,
    slug: "creator-activate",
    title: "Creator Activation",
    route: APP_ROUTES.creatorActivate,
    purpose: "Unlock creator access after required steps.",
  },
  {
    number: 12,
    slug: "creator-dashboard",
    title: "Creator Dashboard",
    route: APP_ROUTES.creatorDashboard,
    purpose: "Full creator business dashboard after approval.",
  },
];

export function getScreenByRoute(route: string): AppScreenMeta | undefined {
  if (route.startsWith("/app/creators/") && route !== APP_ROUTES.creatorLeaderboard && route !== APP_ROUTES.creatorActivate) {
    return APP_SCREENS.find((s) => s.number === 10);
  }
  return APP_SCREENS.find((s) => s.route === route);
}
