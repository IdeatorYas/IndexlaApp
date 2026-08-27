/**
 * Stage 1 oracle wiring plan — USDC/USD + cbBTC/USD primary, BTC/USD peg monitor.
 */
import {
  BASE_ORACLE_FEEDS,
  BASE_TOKENS,
  CBBTC_BTC_PEG_MAX_DEVIATION_BPS,
  stage1OracleFeedsConfigured,
} from "@/lib/stable-club/verified-base-addresses";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

export type Stage1OracleWirePlan = {
  chainId: 8453;
  usdc: {
    token: typeof BASE_TOKENS.usdc;
    feed: typeof BASE_ORACLE_FEEDS.usdcUsd.address;
    maxStalenessSec: number;
    decimals: 8;
  };
  cbBtc: {
    token: typeof BASE_TOKENS.cbBtc;
    primaryFeed: typeof BASE_ORACLE_FEEDS.cbBtcUsd.address;
    pegReferenceFeed: typeof BASE_ORACLE_FEEDS.btcUsd.address;
    pegMaxDeviationBps: number;
    maxStalenessSec: number;
    decimals: 8;
  };
  defaultMaxDeviationBps: number;
  ready: boolean;
};

/** Conservative staleness: stables can have long heartbeats; BTC-class tighter. */
export const USDC_FEED_MAX_STALENESS_SEC = 24 * 60 * 60;
export const CBBTC_FEED_MAX_STALENESS_SEC = 2 * 60 * 60;

export function buildStage1OracleWirePlan(): Stage1OracleWirePlan {
  return {
    chainId: 8453,
    usdc: {
      token: BASE_TOKENS.usdc,
      feed: BASE_ORACLE_FEEDS.usdcUsd.address,
      maxStalenessSec: USDC_FEED_MAX_STALENESS_SEC,
      decimals: 8,
    },
    cbBtc: {
      token: BASE_TOKENS.cbBtc,
      primaryFeed: BASE_ORACLE_FEEDS.cbBtcUsd.address,
      pegReferenceFeed: BASE_ORACLE_FEEDS.btcUsd.address,
      pegMaxDeviationBps: CBBTC_BTC_PEG_MAX_DEVIATION_BPS,
      maxStalenessSec: CBBTC_FEED_MAX_STALENESS_SEC,
      decimals: 8,
    },
    defaultMaxDeviationBps: PRIVATE_BETA_LAUNCH_PARAMS.safety.oracleTwapDeviationBps,
    ready: stage1OracleFeedsConfigured(),
  };
}

export function assertStage1OracleWirePlanReady(
  plan: Stage1OracleWirePlan = buildStage1OracleWirePlan(),
): void {
  if (!plan.ready) throw new Error("Stage 1 oracle feeds not verified");
  if (plan.cbBtc.primaryFeed.toLowerCase() === plan.cbBtc.pegReferenceFeed.toLowerCase()) {
    throw new Error("cbBTC primary feed must not equal BTC peg reference");
  }
  if (plan.cbBtc.pegMaxDeviationBps !== CBBTC_BTC_PEG_MAX_DEVIATION_BPS) {
    throw new Error("cbBTC/BTC peg deviation must be 100 bps (1%)");
  }
}
