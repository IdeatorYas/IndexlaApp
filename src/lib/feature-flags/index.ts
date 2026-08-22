export type IndexlaEnvironment = "development" | "staging" | "production";

export type FeatureFlagKey =
  | "ILLUSTRATIVE_DEMO_DATA"
  | "DEXLA_UTILITY_ENABLED"
  | "FEATURED_PLACEMENTS_ENABLED"
  | "PRIVATE_STRATEGY_PAYMENTS_ENABLED"
  | "CREATOR_PUBLISH_BURN_ENABLED"
  | "EARLY_CREATOR_PUBLISH_EXEMPTION_ENABLED"
  | "CROSS_CHAIN_ENABLED"
  | "COW_EXECUTION_ENABLED"
  | "INVESTOR_REWARD_CLAIMS_ENABLED"
  | "NETWORK_ETHEREUM_ENABLED"
  | "NETWORK_BASE_ENABLED"
  | "NETWORK_ARBITRUM_ENABLED"
  | "NETWORK_BNB_ENABLED"
  | "NETWORK_SOLANA_ENABLED"
  | "NETWORK_SUI_ENABLED"
  | "NETWORK_ROBINHOOD_ENABLED";

export type FeatureFlags = Record<FeatureFlagKey, boolean> & {
  /** True when utility UI is shown in dev/staging with non-production labeling */
  DEXLA_DEMO_MODE: boolean;
  environment: IndexlaEnvironment;
};

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim();
}

function readBool(name: string, fallback = false): boolean {
  const value = readEnv(name);
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function getEnvironment(): IndexlaEnvironment {
  const raw =
    readEnv("INDEXLA_ENV") ??
    readEnv("NEXT_PUBLIC_INDEXLA_ENV") ??
    readEnv("NODE_ENV") ??
    "development";
  if (raw === "production" || raw === "staging" || raw === "development") {
    return raw;
  }
  return "development";
}

/**
 * Preview/demo marketplace data.
 * Default ON until explicitly disabled for real production / testnet cutover.
 * Client builds should also set NEXT_PUBLIC_ILLUSTRATIVE_DEMO_DATA.
 */
export function resolveIllustrativeDemoData(
  _environment: IndexlaEnvironment,
): boolean {
  const explicit =
    readEnv("ILLUSTRATIVE_DEMO_DATA") ??
    readEnv("NEXT_PUBLIC_ILLUSTRATIVE_DEMO_DATA");
  if (explicit !== undefined) {
    return explicit === "1" || explicit.toLowerCase() === "true";
  }
  return true;
}

/** Server-side feature flags */
export function getFeatureFlags(): FeatureFlags {
  const environment = getEnvironment();
  const isProduction = environment === "production";
  const illustrativeDemoData = resolveIllustrativeDemoData(environment);
  const demoUtilities =
    illustrativeDemoData ||
    !isProduction ||
    readBool("INDEXLA_DEMO_UTILITIES", false);

  const productionUtilityEnabled = readBool("DEXLA_UTILITY_ENABLED", false);

  return {
    environment,
    ILLUSTRATIVE_DEMO_DATA: illustrativeDemoData,
    DEXLA_DEMO_MODE: demoUtilities && (!isProduction || illustrativeDemoData),
    DEXLA_UTILITY_ENABLED: isProduction
      ? productionUtilityEnabled || illustrativeDemoData
      : demoUtilities || productionUtilityEnabled,
    FEATURED_PLACEMENTS_ENABLED: isProduction
      ? readBool("FEATURED_PLACEMENTS_ENABLED", false) || illustrativeDemoData
      : demoUtilities,
    PRIVATE_STRATEGY_PAYMENTS_ENABLED: isProduction
      ? readBool("PRIVATE_STRATEGY_PAYMENTS_ENABLED", false) ||
        illustrativeDemoData
      : demoUtilities,
    CREATOR_PUBLISH_BURN_ENABLED: isProduction
      ? readBool("CREATOR_PUBLISH_BURN_ENABLED", false) || illustrativeDemoData
      : demoUtilities,
    EARLY_CREATOR_PUBLISH_EXEMPTION_ENABLED: readBool(
      "EARLY_CREATOR_PUBLISH_EXEMPTION_ENABLED",
      false,
    ),
    CROSS_CHAIN_ENABLED: readBool("CROSS_CHAIN_ENABLED", false),
    COW_EXECUTION_ENABLED: readBool("COW_EXECUTION_ENABLED", false),
    INVESTOR_REWARD_CLAIMS_ENABLED: isProduction
      ? readBool("INVESTOR_REWARD_CLAIMS_ENABLED", false) || illustrativeDemoData
      : demoUtilities,
    NETWORK_ETHEREUM_ENABLED: readBool("NETWORK_ETHEREUM_ENABLED", false),
    NETWORK_BASE_ENABLED: readBool("NETWORK_BASE_ENABLED", false),
    NETWORK_ARBITRUM_ENABLED: readBool("NETWORK_ARBITRUM_ENABLED", false),
    NETWORK_BNB_ENABLED: readBool("NETWORK_BNB_ENABLED", false),
    NETWORK_SOLANA_ENABLED: readBool("NETWORK_SOLANA_ENABLED", false),
    NETWORK_SUI_ENABLED: readBool("NETWORK_SUI_ENABLED", false),
    NETWORK_ROBINHOOD_ENABLED: false,
  };
}

/** Client-safe flags for UI badges and preview banner */
export function getClientFeatureFlags(): Pick<
  FeatureFlags,
  "ILLUSTRATIVE_DEMO_DATA" | "DEXLA_DEMO_MODE" | "environment"
> {
  const raw =
    process.env.NEXT_PUBLIC_INDEXLA_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "development");
  const environment: IndexlaEnvironment =
    raw === "production" || raw === "staging" || raw === "development"
      ? raw
      : "development";
  const illustrativeDemoData = resolveIllustrativeDemoData(environment);
  return {
    environment,
    ILLUSTRATIVE_DEMO_DATA: illustrativeDemoData,
    DEXLA_DEMO_MODE: illustrativeDemoData || environment !== "production",
  };
}

export function isNetworkExecutable(
  flags: FeatureFlags,
  network: keyof Pick<
    FeatureFlags,
    | "NETWORK_ETHEREUM_ENABLED"
    | "NETWORK_BASE_ENABLED"
    | "NETWORK_ARBITRUM_ENABLED"
    | "NETWORK_BNB_ENABLED"
    | "NETWORK_SOLANA_ENABLED"
    | "NETWORK_SUI_ENABLED"
    | "NETWORK_ROBINHOOD_ENABLED"
  >,
): boolean {
  return flags[network] === true;
}
