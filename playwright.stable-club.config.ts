import { defineConfig, devices } from "@playwright/test";

const PORT = 4010;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "stable-club.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/e2e/stable-club-global-setup.cjs",
  globalTeardown: "./tests/e2e/stable-club-global-teardown.cjs",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npx next start -p 4010",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      STABLE_CLUB_DEV_ENABLED: "true",
      NEXT_PUBLIC_STABLE_CLUB_DEV_ENABLED: "true",
      STABLE_CLUB_E2E_SIGNING: "true",
      STABLE_CLUB_E2E_PRIVATE_KEY:
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      STABLE_CLUB_FEE_RECIPIENT: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    },
  },
});
