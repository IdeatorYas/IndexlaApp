/**
 * Founder-approved Base gas ceiling for capped MVP.
 * Encoded in PRIVATE_BETA_LAUNCH_PARAMS. Live SafetyController owner is the MVP Safe
 * (setMaxGasPriceWei is onlyOwner). Policy docs still prefer eventual Timelock ownership.
 */
export const APPROVED_GAS_CEILING_WEI = "100000000000" as const; // 100 gwei

export const GAS_CEILING_RECOMMENDATION = {
  chainId: 8453 as const,
  measuredAt: "2026-09-07",
  status: "founder-approved-encoded" as const,
  recommendedGasCeilingWei: APPROVED_GAS_CEILING_WEI,
  recommendedGasCeilingGwei: "100",
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
      "Raised from 1 gwei → 100 gwei: 1 gwei blocked real Base txs when fee data ~1.004 gwei (GasPriceTooHigh).",
      "Constructor default is 100 gwei; live Safe must execute setMaxGasPriceWei(100 gwei).",
      "Live owner is MVP Safe (2-of-3); Timelock exists but is not current owner of SafetyController.",
    ],
  },
  /** Founder approved: encode into launch params for capped MVP. */
  encodeInLaunchParams: true,
  adjustableOnlyViaTimelock: false,
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
