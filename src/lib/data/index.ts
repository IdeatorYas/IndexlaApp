import { fixtureDataProvider } from "@/lib/data/fixture-provider";
import { liveDataProvider, testnetDataProvider } from "@/lib/data/live-provider";
import type { IndexlaDataProvider } from "@/lib/data/types";
import { getFeatureFlags } from "@/lib/feature-flags";

export type { DataAvailability, DataResult, DataSourceKind, IndexlaDataProvider } from "@/lib/data/types";

/**
 * App-wide data-access entry point.
 * UI and shell must use these helpers — never import fixtures directly.
 */
export function getDataProvider(): IndexlaDataProvider {
  const flags = getFeatureFlags();
  if (flags.ILLUSTRATIVE_DEMO_DATA) {
    return fixtureDataProvider;
  }
  // Future: branch on INDEXLA_DATA_SOURCE=testnet|live
  const source = process.env.INDEXLA_DATA_SOURCE?.trim();
  if (source === "testnet") {
    return testnetDataProvider;
  }
  return liveDataProvider;
}

export function getDashboard() {
  return getDataProvider().getDashboard();
}

export function getPortfolios() {
  return getDataProvider().getPortfolios();
}

export function getPortfolioById(id: string) {
  return getDataProvider().getPortfolioById(id);
}

export function getCreators() {
  return getDataProvider().getCreators();
}

export function getCreatorByHandle(handle: string) {
  return getDataProvider().getCreatorByHandle(handle);
}

export function getStrategies() {
  return getDataProvider().getStrategies();
}

export function getNetworks() {
  return getDataProvider().getNetworks();
}

export function getDexlaBalance() {
  return getDataProvider().getDexlaBalance();
}

export function getDataLabel() {
  return getDataProvider().getFixtureLabel();
}

export function isIllustrativeDataMode() {
  return getFeatureFlags().ILLUSTRATIVE_DEMO_DATA;
}
