/**
 * Cross-hook signal: deposit success / wallet reconnect → reload five-pool NFTs.
 * Browser-only CustomEvent; no server state.
 */
export const FIVE_POOL_POSITIONS_REFRESH_EVENT =
  "indexla:five-pool-positions-refresh" as const;

export type FivePoolPositionsRefreshDetail = {
  reason: "deposit-confirmed" | "manual" | "wallet" | "reconnect";
  txHash?: string;
};

export function requestFivePoolPositionsRefresh(
  detail: FivePoolPositionsRefreshDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FIVE_POOL_POSITIONS_REFRESH_EVENT, { detail }),
  );
}
