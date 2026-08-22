import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getFeatureFlags } from "@/lib/feature-flags";

const ORIGINAL_ENV = { ...process.env };

describe("feature-flags", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to demo utility UI outside production", () => {
    process.env.INDEXLA_ENV = "development";
    const flags = getFeatureFlags();
    expect(flags.DEXLA_DEMO_MODE).toBe(true);
    expect(flags.DEXLA_UTILITY_ENABLED).toBe(true);
  });

  it("disables utilities on production by default", () => {
    process.env.INDEXLA_ENV = "production";
    delete process.env.DEXLA_UTILITY_ENABLED;
    const flags = getFeatureFlags();
    expect(flags.DEXLA_DEMO_MODE).toBe(false);
    expect(flags.DEXLA_UTILITY_ENABLED).toBe(false);
    expect(flags.NETWORK_ROBINHOOD_ENABLED).toBe(false);
  });

  it("keeps Robinhood execution disabled even when flagged", () => {
    process.env.NETWORK_ROBINHOOD_ENABLED = "true";
    const flags = getFeatureFlags();
    expect(flags.NETWORK_ROBINHOOD_ENABLED).toBe(false);
  });
});
