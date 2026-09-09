/**
 * Uni recover (approve + SwapRouter02 exactInputSingle / multicall) gas policy.
 *
 * Post-9e3d55e evidence: wallet mined approve@60761 and swap@136880 — dapp gas
 * floors were stripped. Force via EIP-1193 wrapper + max approve + one multicall.
 */
import { getAddress, type Address } from "viem";
import { BASE_DEX_UNISWAP_V3, BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  parseHexGasQuantity,
  toHexGasQuantity,
} from "@/lib/stable-club/five-pool-deposit-gas";

export const RECOVER_GAS_BUFFER_BPS = 6_000;
export const RECOVER_APPROVE_GAS_FLOOR = BigInt(120_000);
export const RECOVER_SWAP_GAS_FLOOR = BigInt(320_000);
export const RECOVER_SWEEP_GAS_FLOOR = BigInt(900_000);
export const RECOVER_GAS_CEILING = BigInt(2_000_000);

export const RECOVER_MAX_APPROVE_AMOUNT =
  BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

export const RECOVER_ALLOWANCE_KEEPALIVE_WEI = BigInt(1);

export const RECOVER_DUST_EPSILON_BY_SYMBOL = {
  cbBTC: BigInt(20),
  WETH: BigInt(5_000_000_000),
} as const;

export const RECOVER_APPROVE_OOG_USER_MESSAGE =
  "Approving cbBTC/WETH for the Uniswap router ran out of gas — your wallet signed with a stale gas estimate. Nothing was sold. Tap Resume incomplete withdraw; no LP is re-exited. If Gas limit is editable, set it to at least 120000.";

export const RECOVER_SWAP_OOG_USER_MESSAGE =
  "The residue → USDC swap ran out of gas. LP exit already completed. Tap Resume incomplete withdraw to retry only the swap. If Gas limit is editable, set it to at least 320000.";

export const RECOVER_SWEEP_OOG_USER_MESSAGE =
  "The residue → USDC batch swap ran out of gas. LP exit already completed. Tap Resume incomplete withdraw to retry only the USDC conversion (no LP re-exit). If Gas limit is editable, set it to at least 900000.";

export const EXACT_INPUT_SINGLE_SELECTOR = "0x04e45aaf";
export const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
export const MULTICALL_DEADLINE_SELECTOR = "0x5ae401dc";

export function applyRecoverGasBuffer(params: {
  estimateGas: bigint;
  floor: bigint;
}): bigint {
  if (params.estimateGas <= BigInt(0)) {
    throw new Error("Recover estimateGas must be > 0");
  }
  const buffered =
    (params.estimateGas * BigInt(10_000 + RECOVER_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor = buffered > params.floor ? buffered : params.floor;
  if (withFloor > RECOVER_GAS_CEILING) {
    throw new Error(
      `Recover gas estimate too high (${withFloor.toString()}). Refresh and retry.`,
    );
  }
  return withFloor;
}

export function isWalletGasEstimateStale(params: {
  walletEstimate: bigint | null;
  freshEstimate: bigint;
}): boolean {
  if (params.walletEstimate == null) return false;
  if (params.walletEstimate <= BigInt(0) || params.freshEstimate <= BigInt(0)) {
    return false;
  }
  return params.walletEstimate * BigInt(100) < params.freshEstimate * BigInt(90);
}

export function isOutOfGasError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /ran out of gas|out of gas/i.test(text);
}

function isAddr(a: string | null | undefined, b: Address): boolean {
  if (!a) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

export function isRecoverApproveCall(params: {
  to?: string | null;
  data?: string | null;
}): boolean {
  const data = params.data?.toLowerCase() ?? "";
  if (!data.startsWith(ERC20_APPROVE_SELECTOR)) return false;
  if (data.length < 74) return false;
  const spender = `0x${data.slice(34, 74)}`;
  if (!isAddr(spender, BASE_DEX_UNISWAP_V3.swapRouter)) return false;
  return (
    isAddr(params.to, BASE_TOKENS.cbBTC.address) ||
    isAddr(params.to, BASE_TOKENS.WETH.address)
  );
}

export function isRecoverExactInputSingleCall(params: {
  to?: string | null;
  data?: string | null;
}): boolean {
  const data = params.data?.toLowerCase() ?? "";
  if (!data.startsWith(EXACT_INPUT_SINGLE_SELECTOR)) return false;
  return isAddr(params.to, BASE_DEX_UNISWAP_V3.swapRouter);
}

export function isRecoverSweepMulticallCall(params: {
  to?: string | null;
  data?: string | null;
}): boolean {
  const data = params.data?.toLowerCase() ?? "";
  if (!data.startsWith(MULTICALL_DEADLINE_SELECTOR)) return false;
  return isAddr(params.to, BASE_DEX_UNISWAP_V3.swapRouter);
}

export function recoverGasFloorForCall(params: {
  to?: string | null;
  data?: string | null;
}): bigint | null {
  if (isRecoverApproveCall(params)) return RECOVER_APPROVE_GAS_FLOOR;
  if (isRecoverExactInputSingleCall(params)) return RECOVER_SWAP_GAS_FLOOR;
  if (isRecoverSweepMulticallCall(params)) return RECOVER_SWEEP_GAS_FLOOR;
  return null;
}

export function inflateRecoverEstimateGasHex(
  estimateHex: string,
  floor: bigint,
): `0x${string}` {
  const parsed = parseHexGasQuantity(estimateHex);
  const estimate = parsed ?? floor;
  return toHexGasQuantity(applyRecoverGasBuffer({ estimateGas: estimate, floor }));
}

export function forceRecoverTxGas(params: {
  gas?: string | number | bigint | null;
  floor: bigint;
}): `0x${string}` {
  const fromGas = parseHexGasQuantity(params.gas ?? null);
  const base = fromGas != null && fromGas > BigInt(0) ? fromGas : params.floor;
  return toHexGasQuantity(
    applyRecoverGasBuffer({
      estimateGas: base < params.floor ? params.floor : base,
      floor: params.floor,
    }),
  );
}
