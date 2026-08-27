/**
 * Stable Club private-beta launch parameters — configurable, not permanent constants.
 * Signer addresses must never appear here.
 */

export type StableClubLaunchStage =
  | "stage0-internal"
  | "stage1-private-beta"
  | "stage2-expand-pools"
  | "stage3-automation-gated";

export type StableClubLaunchParams = {
  stage: StableClubLaunchStage;
  chainId: 8453;
  /** USD 6-decimal human units for docs/UI; on-chain encoding deferred. */
  capsUsd: {
    perUser: number;
    perTransaction: number;
    perPool: number;
    globalTvl: number;
    dailyUserActionValue: number;
    minimumPosition: number;
  };
  safety: {
    /** Stablecoin depeg pause threshold in bps (100 = 1%). */
    stablecoinDepegBps: number;
    /** Max oracle/TWAP deviation in bps (100 = 1%). */
    oracleTwapDeviationBps: number;
    requireChainlink: true;
    preferProtocolTwap: true;
    failClosedOnStaleOracle: true;
    userPaysGas: true;
    /** Wei; null until measured for the launch window. */
    gasCeilingWei: string | null;
  };
  automation: {
    harvestEnabled: boolean;
    compoundEnabled: boolean;
    rebalanceEnabled: boolean;
  };
  governance: {
    multisigThreshold: 3;
    multisigSize: 5;
    timelockSeconds: number;
    emergencyPauseImmediate: true;
    unpauseRequiresTimelock: true;
    /** Intentionally empty — never commit production signer addresses. */
    multisigSignersTbd: true;
  };
  fee: {
    feeBps: 100;
    denominator: 10_000;
    rounding: "floor";
    chargeZeroWhenFloorIsZero: true;
  };
};

/** Proposed private-beta defaults (founder-approved as configurable launch params). */
export const PRIVATE_BETA_LAUNCH_PARAMS: StableClubLaunchParams = {
  stage: "stage1-private-beta",
  chainId: 8453,
  capsUsd: {
    perUser: 2_500,
    perTransaction: 2_500,
    perPool: 15_000,
    globalTvl: 25_000,
    dailyUserActionValue: 5_000,
    minimumPosition: 250,
  },
  safety: {
    stablecoinDepegBps: 100,
    oracleTwapDeviationBps: 100,
    requireChainlink: true,
    preferProtocolTwap: true,
    failClosedOnStaleOracle: true,
    userPaysGas: true,
    gasCeilingWei: null,
  },
  automation: {
    harvestEnabled: false,
    compoundEnabled: false,
    rebalanceEnabled: false,
  },
  governance: {
    multisigThreshold: 3,
    multisigSize: 5,
    timelockSeconds: 48 * 60 * 60,
    emergencyPauseImmediate: true,
    unpauseRequiresTimelock: true,
    multisigSignersTbd: true,
  },
  fee: {
    feeBps: 100,
    denominator: 10_000,
    rounding: "floor",
    chargeZeroWhenFloorIsZero: true,
  },
};

export function isLaunchAutomationDisabled(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): boolean {
  return (
    !params.automation.harvestEnabled &&
    !params.automation.compoundEnabled &&
    !params.automation.rebalanceEnabled
  );
}

/** Floor fee matching on-chain FeeRouter: (gross * 100) / 10000. */
export function floorSwapFeeAmount(
  grossAmount: bigint,
  feeBps: bigint = BigInt(100),
  denominator: bigint = BigInt(10_000),
): bigint {
  return (grossAmount * feeBps) / denominator;
}

export function assertNoSignerAddresses(params: StableClubLaunchParams): void {
  if (!params.governance.multisigSignersTbd) {
    throw new Error("Production signer addresses must stay TBD in source");
  }
}
