import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "tmp", "stable-club-rebuild-qa");
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.SC_SHOT_BASE || "http://127.0.0.1:3460";

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: path.join(outDir, file),
    fullPage: true,
  });
  console.log("saved", file);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await shot(page, `${base}/app/stable-club`, "01-disconnected.png");
await shot(page, `${base}/app/stable-club?ui=deposit`, "02-deposit.png");
await shot(page, `${base}/app/stable-club?ui=positions`, "03-positions.png");
await browser.close();
