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
      page.getByRole("heading", { name: "Marketplace", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trending Now" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Most Invested" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Newly Published" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Preview · Illustrative|Preview/i }),
    ).toBeVisible();
    await expect(page.getByText("Preview · Illustrative Data")).toBeAttached();
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
      const header = page.getByRole("banner");
      const hero = page.getByRole("heading", { name: /Discover\. Build\. Automate\./ });
      const explore = page.getByRole("heading", { name: "Marketplace", exact: true });
      const carousel = page.getByRole("region", {
        name: "Featured products carousel",
      });

      await expect(carousel).toBeVisible();
      await expect(header).toBeVisible();
      await expect(hero).toBeVisible();
      await expect(explore).toBeVisible();

      const headerBox = await header.boundingBox();
      const heroBox = await hero.boundingBox();
      const carouselBox = await carousel.boundingBox();
      const exploreBox = await explore.boundingBox();

      expect(headerBox && heroBox && carouselBox && exploreBox).toBeTruthy();
      if (headerBox && heroBox && carouselBox && exploreBox) {
        expect(carouselBox.y).toBeGreaterThanOrEqual(headerBox.y - 2);
        expect(carouselBox.y).toBeLessThan(heroBox.y);
        expect(heroBox.y).toBeLessThan(exploreBox.y);
      }

      await expect(
        page.getByRole("button", {
          name: "Search portfolios, indexes, creators and strategies",
        }),
      ).toHaveCount(0);

      await expect(
        page.getByText("0% Management · 0% Performance · 0% Exit"),
      ).toBeVisible();
    });

    test("explore marketplace tabs and asset categories", async ({ page }) => {
      await expect(
        page.getByRole("tablist", { name: "Marketplace product type" }),
      ).toBeVisible();
      await page
        .getByRole("tablist", { name: "Marketplace product type" })
        .getByRole("tab", { name: "Portfolios" })
        .click();
      await expect(
        page
          .getByRole("tablist", { name: "Marketplace product type" })
          .getByRole("tab", { name: "Portfolios" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("tablist", { name: "Asset category" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "🔥 Degen Club" }),
      ).toHaveCount(0);
    });

    test("featured carousel opens product details", async ({ page }) => {
      const carousel = page.getByRole("region", {
        name: "Featured products carousel",
      });
      await carousel.hover();
      await carousel
        .getByRole("link", { name: /Layer 1 Index/i })
        .first()
        .click();
      await expect(page).toHaveURL(/\/app\/product\//);
    });

    test("centered view all opens discover", async ({ page }) => {
      await page
        .getByRole("link", { name: "View All", exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/discover/);
    });

    test("compact explore shows six product cards without search", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(
        page.getByPlaceholder("Search by index name or asset"),
      ).toHaveCount(0);

      const productCards = page.locator(
        '[aria-label="Marketplace"] article',
      );
      await expect(productCards).toHaveCount(6);

      const exploreHeading = page.getByRole("heading", {
        name: "Marketplace",
        exact: true,
      });
      const firstCard = productCards.first();
      const sixthCard = productCards.nth(5);

      const headingBox = await exploreHeading.boundingBox();
      const firstBox = await firstCard.boundingBox();
      const sixthBox = await sixthCard.boundingBox();

      expect(headingBox && firstBox && sixthBox).toBeTruthy();
      if (headingBox && firstBox && sixthBox) {
        expect(firstBox.y - headingBox.y).toBeLessThan(250);
        expect(sixthBox.y + sixthBox.height).toBeLessThan(900);
      }
    });
  });
});
