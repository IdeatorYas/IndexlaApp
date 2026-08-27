import { describe, expect, it } from "vitest";
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  assertNoSignerAddresses,
  floorSwapFeeAmount,
  isLaunchAutomationDisabled,
} from "@/lib/stable-club/launch-params";
import {
  STAGE1_PRIVATE_BETA_POOL_ID,
  buildStage1LaunchConfiguration,
} from "@/lib/stable-club/stage1-launch";

describe("private-beta launch params", () => {
  it("keeps Stage 1 automation fully disabled", () => {
    expect(isLaunchAutomationDisabled()).toBe(true);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation).toEqual({
      harvestEnabled: false,
      compoundEnabled: false,
      rebalanceEnabled: false,
    });
  });

  it("encodes approved configurable USD caps", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.capsUsd).toEqual({
      perUser: 2_500,
      perTransaction: 2_500,
      perPool: 15_000,
      globalTvl: 25_000,
      dailyUserActionValue: 5_000,
      minimumPosition: 250,
    });
  });

  it("Stage 1 pool id is UNI-005 only", () => {
    expect(STAGE1_PRIVATE_BETA_POOL_ID).toBe("USDC-cbBTC-UNI-005");
    expect(buildStage1LaunchConfiguration().poolIds).toEqual(["USDC-cbBTC-UNI-005"]);
  });

  it("encodes 48h timelock and 3-of-5 without signer addresses", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds).toBe(48 * 3600);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.multisigThreshold).toBe(3);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.multisigSize).toBe(5);
    expect(() => assertNoSignerAddresses(PRIVATE_BETA_LAUNCH_PARAMS)).not.toThrow();
  });

  it("uses floor fee rounding and charges zero when floor is zero", () => {
    expect(floorSwapFeeAmount(BigInt(0))).toBe(BigInt(0));
    expect(floorSwapFeeAmount(BigInt(99))).toBe(BigInt(0));
    expect(floorSwapFeeAmount(BigInt(100))).toBe(BigInt(1));
    expect(floorSwapFeeAmount(BigInt(10_000))).toBe(BigInt(100));
  });

  it("sets 1% depeg and oracle deviation defaults", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.safety.stablecoinDepegBps).toBe(100);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.safety.oracleTwapDeviationBps).toBe(100);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.safety.failClosedOnStaleOracle).toBe(true);
  });
});
