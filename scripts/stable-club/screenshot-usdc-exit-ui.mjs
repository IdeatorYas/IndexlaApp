import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "tmp", "stable-club-usdc-exit-qa");
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.SC_SHOT_BASE || "http://127.0.0.1:3462";

const browser = await chromium.launch();
for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}/app/stable-club?ui=positions`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: path.join(outDir, `positions-${name}.png`),
    fullPage: true,
  });
  console.log("saved", `positions-${name}.png`);
  await page.close();
}
await browser.close();
