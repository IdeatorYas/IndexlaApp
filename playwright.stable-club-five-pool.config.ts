import { defineConfig, devices } from "@playwright/test";

const PORT = 3457;
const baseURL = `http://127.0.0.1:${PORT}`;

/** Hardhat account #1 — phase2a local testUser (receives minted USDC). */
const TEST_USER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "stable-club-five-pool-deposit.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      STABLE_CLUB_DEV_ENABLED: "true",
      NEXT_PUBLIC_STABLE_CLUB_DEV_ENABLED: "true",
      STABLE_CLUB_E2E_SIGNING: "true",
      STABLE_CLUB_E2E_PRIVATE_KEY: TEST_USER_KEY,
      STABLE_CLUB_FEE_RECIPIENT: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    },
  },
});
