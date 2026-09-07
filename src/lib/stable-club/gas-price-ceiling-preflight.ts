/**
 * Preflight against SafetyController.maxGasPriceWei before deposit / exit writes.
 * Matches on-chain assertDepositAllowed / assertSwapAllowed: tx.gasprice > max → GasPriceTooHigh.
 */
import { formatUnits, type Address } from "viem";
import { safetyControllerAbi } from "@/lib/stable-club/abis";

export type GasPriceCeilingPreflightInput = {
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof safetyControllerAbi;
      functionName: "maxGasPriceWei";
      args?: readonly [];
    }) => Promise<bigint>;
    getGasPrice: () => Promise<bigint>;
  };
  safetyController: Address;
  /** Optional override (tests); defaults to publicClient.getGasPrice(). */
  txGasPriceWei?: bigint;
};

export type GasPriceCeilingPreflightResult = {
  ok: true;
  maxGasPriceWei: bigint;
  txGasPriceWei: bigint;
};

export function formatGasPriceCeilingExceededMessage(params: {
  txGasPriceWei: bigint;
  maxGasPriceWei: bigint;
}): string {
  const txGwei = formatUnits(params.txGasPriceWei, 9);
  const maxGwei = formatUnits(params.maxGasPriceWei, 9);
  return (
    `Network gas price (${txGwei} gwei) exceeds SafetyController maxGasPriceWei ` +
    `(${maxGwei} gwei). Deposit and Withdraw are blocked until gas falls or governance ` +
    `raises the ceiling via setMaxGasPriceWei. (On-chain error: GasPriceTooHigh)`
  );
}

/**
 * Throws a user-facing Error when live gas price would trip GasPriceTooHigh.
 */
export async function requireGasPriceWithinSafetyCeiling(
  params: GasPriceCeilingPreflightInput,
): Promise<GasPriceCeilingPreflightResult> {
  const maxGasPriceWei = await params.publicClient.readContract({
    address: params.safetyController,
    abi: safetyControllerAbi,
    functionName: "maxGasPriceWei",
  });
  const txGasPriceWei =
    params.txGasPriceWei !== undefined
      ? params.txGasPriceWei
      : await params.publicClient.getGasPrice();

  if (txGasPriceWei > maxGasPriceWei) {
    throw new Error(
      formatGasPriceCeilingExceededMessage({ txGasPriceWei, maxGasPriceWei }),
    );
  }

  return { ok: true, maxGasPriceWei, txGasPriceWei };
}
