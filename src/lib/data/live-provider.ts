import type { DashboardData } from "@/lib/domain/dashboard";
import type { IndexlaDataProvider, DataResult } from "@/lib/data/types";
import { getEmptyDashboardData } from "@/lib/fixtures/dashboard";

/**
 * Live / testnet provider stub.
 * Wallet, contract and execution adapters remain disabled.
 * Returns unavailable/empty results until Phase 5 / testnet cutover.
 */
function unavailable<T>(data: T, reason: string): DataResult<T> {
  return {
    source: "live",
    availability: "unavailable",
    isIllustrative: false,
    data,
    reason,
  };
}

const LIVE_REASON =
  "Live application data is not connected. Keep ILLUSTRATIVE_DEMO_DATA enabled for preview.";

export const liveDataProvider: IndexlaDataProvider = {
  kind: "live",
  isIllustrative: false,
  getDashboard() {
    return unavailable<DashboardData>(getEmptyDashboardData(), LIVE_REASON);
  },
  getPortfolios() {
    return unavailable([], LIVE_REASON);
  },
  getPortfolioById() {
    return unavailable(null, LIVE_REASON);
  },
  getCreators() {
    return unavailable([], LIVE_REASON);
  },
  getCreatorByHandle() {
    return unavailable(null, LIVE_REASON);
  },
  getStrategies() {
    return unavailable([], LIVE_REASON);
  },
  getNetworks() {
    return unavailable([], LIVE_REASON);
  },
  getDexlaBalance() {
    return unavailable(
      {
        balance: 0,
        tier: "none",
        discountPercent: 0,
        nextTier: "10",
        balanceToNextTier: 0,
        isDemo: false,
      },
      LIVE_REASON,
    );
  },
  getFixtureLabel() {
    return "Live";
  },
};

/** Alias for future testnet wiring — same disabled surface for now */
export const testnetDataProvider: IndexlaDataProvider = {
  ...liveDataProvider,
  kind: "testnet",
  getFixtureLabel() {
    return "Testnet";
  },
};
