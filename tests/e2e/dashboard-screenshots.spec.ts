import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { APP_ROUTES } from "../../src/lib/routes";

const OUT_DIR = path.join(process.cwd(), "tmp", "dashboard-screenshots");

test.describe("Dashboard screenshots", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  async function prepareDashboard(page: import("@playwright/test").Page) {
    await page.goto(APP_ROUTES.dashboard);
    await expect(
      page.getByRole("heading", { name: /Discover\. Build\. Automate\./ }),
    ).toBeVisible();
  }

  async function connect(page: import("@playwright/test").Page) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Connect Wallet" })
      .click();
    await expect(page.getByText("Total Portfolio Value")).toBeVisible({
      timeout: 5000,
    });
  }

  test("capture desktop dark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await prepareDashboard(page);
    await connect(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("indexla-app-theme", "dark");
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "dashboard-desktop-dark.png"),
      fullPage: true,
    });
  });

  test("capture desktop light", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await prepareDashboard(page);
    await connect(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("indexla-app-theme", "light");
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "dashboard-desktop-light.png"),
      fullPage: true,
    });
  });

  test("capture mobile dark", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareDashboard(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "dashboard-mobile-dark.png"),
      fullPage: true,
    });
  });
});
