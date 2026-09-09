/**
 * Owner NPM multicall gas policy — wallet/raw eth_estimateGas with 0% headroom
 * OOGed at gasUsed==gasLimit==565311 (tx 0x80fa91ef…, burn-inclusive Aero batch).
 * Same calldata later succeeded at ~463k used / 582k limit.
 */

/** Extra headroom over eth_estimateGas (basis points). 4000 = +40%. */
export const OWNER_NPM_MULTICALL_GAS_BUFFER_BPS = 4_000;

/** Floor so tiny estimates still cover decrease+collect+burn ×2. */
export const OWNER_NPM_MULTICALL_GAS_FLOOR = BigInt(700_000);

export const OWNER_NPM_MULTICALL_GAS_CEILING = BigInt(8_000_000);

export const OWNER_NPM_MULTICALL_OOG_USER_MESSAGE =
  "Owner NPM multicall ran out of gas (wallet used a tight estimate as the limit). Resume incomplete withdraw — do not re-enter the same % on already-exited legs.";

export function applyOwnerNpmMulticallGasBuffer(estimateGas: bigint): bigint {
  if (estimateGas <= BigInt(0)) {
    throw new Error("NPM multicall estimateGas must be > 0");
  }
  const buffered =
    (estimateGas * BigInt(10_000 + OWNER_NPM_MULTICALL_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor =
    buffered > OWNER_NPM_MULTICALL_GAS_FLOOR
      ? buffered
      : OWNER_NPM_MULTICALL_GAS_FLOOR;
  if (withFloor > OWNER_NPM_MULTICALL_GAS_CEILING) {
    throw new Error(
      `NPM multicall gas estimate too high (${withFloor.toString()}). Refresh and retry.`,
    );
  }
  return withFloor;
}
