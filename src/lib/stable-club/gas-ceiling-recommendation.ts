/**
 * Founder-approved Base gas ceiling for capped MVP.
 * Encoded in PRIVATE_BETA_LAUNCH_PARAMS; on-chain changes only via 48h Timelock
 * (SafetyController.setMaxGasPriceWei — owner = Timelock).
 */
export const APPROVED_GAS_CEILING_WEI = "1000000000" as const; // 1 gwei

export const GAS_CEILING_RECOMMENDATION = {
  chainId: 8453 as const,
  measuredAt: "2026-08-27",
  status: "founder-approved-encoded" as const,
  recommendedGasCeilingWei: APPROVED_GAS_CEILING_WEI,
  recommendedGasCeilingGwei: "1",
  evidence: {
    baseFeeSamples: 12,
    baseFeeWeiMin: "5000000",
    baseFeeWeiMax: "5000000",
    baseFeeWeiP95: "5000000",
    l1BaseFeeWeiSample: "71334913",
    l1DataFeeWeiApprox500bCalldata: "703386724",
    stage1DepositL2GasForkRehearsal: "275897",
    stage1ExitL2GasForkRehearsal: "178669",
    stage1DepositL2GasApproxProduction: "250000-550000",
    notes: [
      "SafetyController checks tx.gasprice (L2), not total user cost including L1 data fee.",
      "L1 data fee dominates user UX cost variance on Base; keep separate ops monitoring.",
      "1 gwei ceiling ≈ 200× observed baseFee — fail-closed on abnormal L2 fee spikes.",
      "On-chain adjustments only via Safe → 48h Timelock → setMaxGasPriceWei.",
    ],
  },
  /** Founder approved 2026-08-27: encode into launch params for capped MVP. */
  encodeInLaunchParams: true,
  adjustableOnlyViaTimelock: true,
  timelockSecondsRequired: 48 * 60 * 60,
} as const;

export function assertGasCeilingMatchesApproval(
  gasCeilingWei: string | null,
): void {
  if (gasCeilingWei !== APPROVED_GAS_CEILING_WEI) {
    throw new Error(
      `gasCeilingWei must equal founder-approved ${APPROVED_GAS_CEILING_WEI} (got ${gasCeilingWei})`,
    );
  }
}
