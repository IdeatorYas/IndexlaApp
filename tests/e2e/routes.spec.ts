import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

const ROUTES = [
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
  "/app/creators/indexla",
  APP_ROUTES.creatorDashboard,
];

test.describe("Phase 1 route stubs", () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`loads ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    });
  }

  test("root redirects to dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("sidebar includes Degen Club from shell phase", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
        name: "Degen Club",
        exact: true,
      }),
    ).toBeVisible();
  });
});
