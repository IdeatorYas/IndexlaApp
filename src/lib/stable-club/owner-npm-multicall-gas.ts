/**
 * Owner NPM multicall gas policy — wallet/raw eth_estimateGas with 0% headroom
 * OOGed at gasUsed==gasLimit==565311 (tx 0x80fa91ef…, burn-inclusive Aero batch)
 * and again at 429802==429802 (tx 0xd73deb70…, Aero current NPM) when the wallet
 * stripped the dapp ≥700k floor and substituted a tight estimate.
 * Same calldata later succeeded with buffered limits.
 */
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
} from "@/lib/stable-club/official-pools";

/** Extra headroom over eth_estimateGas (basis points). 4000 = +40%. */
export const OWNER_NPM_MULTICALL_GAS_BUFFER_BPS = 4_000;

/** Floor so tiny estimates still cover decrease+collect+burn ×2. */
export const OWNER_NPM_MULTICALL_GAS_FLOOR = BigInt(700_000);

export const OWNER_NPM_MULTICALL_GAS_CEILING = BigInt(8_000_000);

/** Uniswap / Slipstream NonfungiblePositionManager.multicall(bytes[]) */
export const OWNER_NPM_MULTICALL_SELECTOR = "0xac9650d8";

export const OWNER_NPM_ALLOWLIST = new Set(
  [
    BASE_DEX_UNISWAP_V3.npm,
    BASE_DEX_AERODROME_CURRENT.npm,
    BASE_DEX_AERODROME_LEGACY.npm,
  ].map((a) => a.toLowerCase()),
);

export const OWNER_NPM_MULTICALL_OOG_USER_MESSAGE =
  "Owner NPM multicall ran out of gas (wallet used a tight estimate as the limit). Tap Resume incomplete withdraw — do not re-enter the same % on already-exited legs.";

export function parseHexGasQuantity(
  value: string | number | bigint | undefined | null,
): bigint | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      return BigInt(s);
    } catch {
      return null;
    }
  }
  return null;
}

export function toHexGasQuantity(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

export function isOwnerNpmMulticallCall(params: {
  to?: string | null;
  data?: string | null;
}): boolean {
  const to = params.to?.toLowerCase();
  if (!to || !OWNER_NPM_ALLOWLIST.has(to)) return false;
  const data = params.data?.toLowerCase() ?? "";
  return data.startsWith(OWNER_NPM_MULTICALL_SELECTOR);
}

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

export function inflateOwnerNpmMulticallEstimateGasHex(
  estimateHex: string,
): `0x${string}` {
  const estimate = parseHexGasQuantity(estimateHex);
  if (estimate == null || estimate <= BigInt(0)) {
    return toHexGasQuantity(OWNER_NPM_MULTICALL_GAS_FLOOR);
  }
  return toHexGasQuantity(applyOwnerNpmMulticallGasBuffer(estimate));
}

export function forceOwnerNpmMulticallTxGas(params: {
  gas?: string | number | bigint | null;
}): `0x${string}` {
  const fromGas = parseHexGasQuantity(params.gas ?? null);
  const base =
    fromGas != null && fromGas > BigInt(0)
      ? fromGas
      : OWNER_NPM_MULTICALL_GAS_FLOOR;
  return toHexGasQuantity(applyOwnerNpmMulticallGasBuffer(base));
}
