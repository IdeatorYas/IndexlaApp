import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Marketplace-First Dashboard", () => {
  test("disconnected wallet shows marketplace-first layout", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await expect(
      page.getByRole("heading", { name: /Discover\. Build\. Automate\./ }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Featured products carousel" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Explore Marketplace" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trending Now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Most Invested" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Newly Published" }),
    ).toBeVisible();
    await expect(page.getByText("Preview · Illustrative Data")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personal Snapshot" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Product Pathways" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "How INDEXLA Works" }),
    ).toHaveCount(0);
  });

  test.describe("connected", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(APP_ROUTES.dashboard);
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Connect Wallet" })
        .click();
      await expect(
        page.getByRole("button", { name: /0x742d/ }),
      ).toBeVisible({ timeout: 5000 });
    });

    test("renders dashboard sections in final order", async ({ page }) => {
      const hero = page.getByRole("heading", { name: /Discover\. Build\. Automate\./ });
      const explore = page.getByRole("heading", { name: "Explore Marketplace" });
      const trending = page.getByRole("heading", { name: "Trending Now" });

      await expect(hero).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Featured products carousel" }),
      ).toBeVisible();
      await expect(trending).toBeVisible();
      await expect(explore).toBeVisible();

      const heroBox = await hero.boundingBox();
      const carouselBox = await page
        .getByRole("region", { name: "Featured products carousel" })
        .boundingBox();
      const trendingBox = await trending.boundingBox();
      const exploreBox = await explore.boundingBox();

      expect(heroBox && carouselBox && trendingBox && exploreBox).toBeTruthy();
      if (heroBox && carouselBox && trendingBox && exploreBox) {
        expect(carouselBox.y).toBeLessThan(heroBox.y);
        expect(heroBox.y).toBeLessThan(trendingBox.y);
        expect(trendingBox.y).toBeLessThan(exploreBox.y);
      }

      await expect(
        page.getByText("0% Management · 0% Performance · 0% Exit"),
      ).toBeVisible();
    });

    test("explore marketplace tabs and degen club link", async ({ page }) => {
      await expect(
        page.getByRole("tablist", { name: "Explore marketplace product type" }),
      ).toBeVisible();
      await page
        .getByRole("tablist", { name: "Explore marketplace product type" })
        .getByRole("tab", { name: "Indexes" })
        .click();
      await expect(
        page
          .getByRole("tablist", { name: "Explore marketplace product type" })
          .getByRole("tab", { name: "Indexes" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("link", { name: "🔥 Degen Club" }),
      ).toHaveAttribute("href", /\/app\/degen-club$/);
    });

    test("featured carousel opens product details", async ({ page }) => {
      await page
        .getByRole("region", { name: "Featured products carousel" })
        .getByRole("link")
        .first()
        .click();
      await expect(page).toHaveURL(/\/app\/(discover|degen-club)/);
    });

    test("centered view all opens discover", async ({ page }) => {
      await page
        .getByRole("link", { name: "View All", exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/discover/);
    });
  });
});
