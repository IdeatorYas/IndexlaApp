/** Deterministic illustrative per-asset returns until live market feeds exist. */

export type IllustrativeAssetPerformance = {
  h24: number;
  d7: number;
  d30: number;
};

function hashAssetId(assetId: string): number {
  const id = assetId.toLowerCase();
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Stable illustrative 24H / 7D / 30D for an asset.
 * Not live market data — always pair with Illustrative labeling in UI.
 */
export function getIllustrativeAssetPerformance(
  assetId: string,
): IllustrativeAssetPerformance {
  const n = hashAssetId(assetId);
  return {
    h24: round1(((n % 280) / 100) - 1.2),
    d7: round1(((n % 820) / 100) - 3.5),
    d30: round1(((n % 1800) / 100) - 6),
  };
}
