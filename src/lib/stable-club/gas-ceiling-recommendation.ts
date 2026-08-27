/**
 * Evidence-based Base gas ceiling recommendation.
 * Does NOT set PRIVATE_BETA_LAUNCH_PARAMS.safety.gasCeilingWei until founder approval.
 * SafetyController.maxGasPriceWei is Timelock-configurable (enforces tx.gasprice / L2 gas price).
 */
export const GAS_CEILING_RECOMMENDATION = {
  chainId: 8453 as const,
  measuredAt: "2026-08-27",
  status: "recommended-pending-founder-approval" as const,
  /**
   * Recommended SafetyController.maxGasPriceWei / launch gasCeilingWei.
   * Based on Base baseFee≈5e6 wei flat sample + 200× headroom for tip/spike.
   * 1 gwei = 1e9 wei.
   */
  recommendedGasCeilingWei: "1000000000",
  recommendedGasCeilingGwei: "1",
  evidence: {
    baseFeeSamples: 12,
    baseFeeWeiMin: "5000000",
    baseFeeWeiMax: "5000000",
    baseFeeWeiP95: "5000000",
    l1BaseFeeWeiSample: "71334913",
    /** OP GasPriceOracle.getL1Fee sample (see gas-ceiling-evidence.json). */
    l1DataFeeWeiApprox500bCalldata: "703386724",
    /** Fork rehearsal test-pool deposit/exit L2 gasUsed (not full UNI-005). */
    stage1DepositL2GasForkRehearsal: "275897",
    stage1ExitL2GasForkRehearsal: "178669",
    stage1DepositL2GasApproxProduction: "250000-550000",
    notes: [
      "SafetyController checks tx.gasprice (L2), not total user cost including L1 data fee.",
      "L1 data fee dominates user UX cost variance on Base; keep separate ops monitoring.",
      "1 gwei ceiling ≈ 200× observed baseFee — fail-closed on abnormal L2 fee spikes.",
      "Timelock can lower/raise via setMaxGasPriceWei after deploy.",
    ],
  },
  /** Keep launch params null until founder explicitly approves encoding this value. */
  encodeInLaunchParams: false,
} as const;

export function assertGasCeilingStillUnencoded(
  gasCeilingWei: string | null,
): void {
  if (gasCeilingWei != null && GAS_CEILING_RECOMMENDATION.encodeInLaunchParams === false) {
    throw new Error(
      "gasCeilingWei must remain null in launch params until founder approves recommendation",
    );
  }
}
