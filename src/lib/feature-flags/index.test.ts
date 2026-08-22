import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getFeatureFlags } from "@/lib/feature-flags";

const ORIGINAL_ENV = { ...process.env };

describe("feature-flags", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ILLUSTRATIVE_DEMO_DATA;
    delete process.env.NEXT_PUBLIC_ILLUSTRATIVE_DEMO_DATA;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults ILLUSTRATIVE_DEMO_DATA on for preview phase", () => {
    process.env.INDEXLA_ENV = "development";
    const flags = getFeatureFlags();
    expect(flags.ILLUSTRATIVE_DEMO_DATA).toBe(true);
    expect(flags.DEXLA_DEMO_MODE).toBe(true);
    expect(flags.DEXLA_UTILITY_ENABLED).toBe(true);
  });

  it("allows explicitly disabling illustrative demo data in production", () => {
    process.env.INDEXLA_ENV = "production";
    process.env.ILLUSTRATIVE_DEMO_DATA = "false";
    delete process.env.DEXLA_UTILITY_ENABLED;
    const flags = getFeatureFlags();
    expect(flags.ILLUSTRATIVE_DEMO_DATA).toBe(false);
    expect(flags.DEXLA_DEMO_MODE).toBe(false);
    expect(flags.DEXLA_UTILITY_ENABLED).toBe(false);
    expect(flags.NETWORK_ROBINHOOD_ENABLED).toBe(false);
  });

  it("keeps illustrative demo data when explicitly enabled on production preview", () => {
    process.env.INDEXLA_ENV = "production";
    process.env.ILLUSTRATIVE_DEMO_DATA = "true";
    const flags = getFeatureFlags();
    expect(flags.ILLUSTRATIVE_DEMO_DATA).toBe(true);
  });

  it("keeps Robinhood execution disabled even when flagged", () => {
    process.env.NETWORK_ROBINHOOD_ENABLED = "true";
    const flags = getFeatureFlags();
    expect(flags.NETWORK_ROBINHOOD_ENABLED).toBe(false);
  });
});
