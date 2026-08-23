/** Illustrative marketplace metrics — volume must exceed AUM when AUM is non-zero. */
export function normalizeIllustrativeVolume(
  aumUsd: number,
  volumeUsd: number,
): number {
  if (aumUsd <= 0) return 0;
  const floor = Math.round(aumUsd * 1.35);
  return Math.max(volumeUsd, floor);
}

export function normalizeProductMetrics<
  T extends { aumUsd: number; volumeUsd: number },
>(product: T): T {
  return {
    ...product,
    volumeUsd: normalizeIllustrativeVolume(product.aumUsd, product.volumeUsd),
  };
}
