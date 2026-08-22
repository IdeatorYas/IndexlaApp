import type {
  DexlaSaveTier,
  PortfolioFeeType,
} from "@/lib/domain/types";

export const BASE_EXECUTION_FEE_BPS = 100; // 1%

export type FeeAllocationKey =
  | "creator"
  | "platform"
  | "treasury"
  | "rewards"
  | "buybackBurn";

export interface FeeCalculationInput {
  portfolioType: PortfolioFeeType;
  tradeAmountUsd: number;
  dexlaBalance: number;
  estimatedGasUsd: number;
  estimatedBridgeUsd: number;
  expectedSlippageBps: number;
}

export interface FeeAllocationSplit {
  creator: number;
  platform: number;
  treasury: number;
  rewards: number;
  buybackBurn: number;
}

export interface FeeCalculationResult {
  baseExecutionFeeUsd: number;
  saveTier: DexlaSaveTier;
  saveDiscountPercent: number;
  saveDiscountUsd: number;
  finalIndexlaFeeUsd: number;
  userPaidGasUsd: number;
  userPaidBridgeUsd: number;
  expectedSlippageBps: number;
  totalEstimatedTransactionCostUsd: number;
  allocationSplit: FeeAllocationSplit;
}

const CREATOR_PORTFOLIO_SPLIT: FeeAllocationSplit = {
  creator: 50,
  platform: 20,
  treasury: 10,
  rewards: 10,
  buybackBurn: 10,
};

const INDEXLA_PORTFOLIO_SPLIT: FeeAllocationSplit = {
  creator: 0,
  platform: 50,
  treasury: 20,
  rewards: 20,
  buybackBurn: 10,
};

export function resolveSaveTier(balance: number): DexlaSaveTier {
  if (balance >= 10_000) return "30";
  if (balance >= 5_000) return "20";
  if (balance >= 2_500) return "10";
  return "none";
}

export function saveDiscountPercentForTier(tier: DexlaSaveTier): number {
  switch (tier) {
    case "30":
      return 30;
    case "20":
      return 20;
    case "10":
      return 10;
    default:
      return 0;
  }
}

export function getFeeAllocationSplit(
  portfolioType: PortfolioFeeType,
): FeeAllocationSplit {
  return portfolioType === "creator-portfolio"
    ? CREATOR_PORTFOLIO_SPLIT
    : INDEXLA_PORTFOLIO_SPLIT;
}

export function calculateFees(input: FeeCalculationInput): FeeCalculationResult {
  const saveTier = resolveSaveTier(input.dexlaBalance);
  const saveDiscountPercent = saveDiscountPercentForTier(saveTier);
  const baseExecutionFeeUsd =
    (input.tradeAmountUsd * BASE_EXECUTION_FEE_BPS) / 10_000;
  const saveDiscountUsd =
    (baseExecutionFeeUsd * saveDiscountPercent) / 100;
  const finalIndexlaFeeUsd = Math.max(
    0,
    baseExecutionFeeUsd - saveDiscountUsd,
  );
  const totalEstimatedTransactionCostUsd =
    finalIndexlaFeeUsd +
    input.estimatedGasUsd +
    input.estimatedBridgeUsd;

  return {
    baseExecutionFeeUsd,
    saveTier,
    saveDiscountPercent,
    saveDiscountUsd,
    finalIndexlaFeeUsd,
    userPaidGasUsd: input.estimatedGasUsd,
    userPaidBridgeUsd: input.estimatedBridgeUsd,
    expectedSlippageBps: input.expectedSlippageBps,
    totalEstimatedTransactionCostUsd,
    allocationSplit: getFeeAllocationSplit(input.portfolioType),
  };
}

export function allocationTotals100(split: FeeAllocationSplit): boolean {
  return (
    split.creator +
      split.platform +
      split.treasury +
      split.rewards +
      split.buybackBurn ===
    100
  );
}
