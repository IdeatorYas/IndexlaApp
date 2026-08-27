import { describe, expect, it } from "vitest";
import { APP_ROUTES, APP_SCREENS, NAV_ITEMS } from "@/lib/routes";

describe("routes", () => {
  it("defines 9 primary navigation destinations including Stable Club (dev-gated)", () => {
    expect(NAV_ITEMS).toHaveLength(9);
    expect(NAV_ITEMS.some((item) => item.href === APP_ROUTES.stableClub)).toBe(true);
  });

  it("defines 12 application screens", () => {
    expect(APP_SCREENS).toHaveLength(12);
  });

  it("includes all route contract paths", () => {
    const routes = new Set([
      APP_ROUTES.dashboard,
      APP_ROUTES.discover,
      APP_ROUTES.degenClub,
      APP_ROUTES.create,
      APP_ROUTES.portfolio,
      APP_ROUTES.strategies,
      APP_ROUTES.leaderboard,
      APP_ROUTES.creators,
      APP_ROUTES.creatorLeaderboard,
      APP_ROUTES.creatorActivate,
      APP_ROUTES.creatorDashboard,
      "/app/creators/{handle}",
    ]);
    expect(routes.size).toBe(12);
    expect(APP_SCREENS.map((s) => s.route)).toEqual(expect.arrayContaining([...routes]));
  });
});
