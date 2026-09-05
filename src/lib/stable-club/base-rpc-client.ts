/**
 * Production Base RPC endpoint policy for Stable Club browser reads.
 * Never point deposit/Permit2 allowance traffic at public mainnet.base.org.
 */
export const STABLE_CLUB_BASE_RPC_PROXY_PATH = "/api/stable-club/base-rpc";

/** Friendly message when every configured upstream fails (rate-limit / outage). */
export const STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE =
  "Network is busy. Please wait a moment and try again.";

/**
 * Absolute same-origin proxy URL for viem `http()` in the browser.
 * Falls back to the relative path when `window` is unavailable (tests).
 */
export function resolveStableClubBaseRpcProxyUrl(
  origin?: string | null,
): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    "",
  );
  if (!base) return STABLE_CLUB_BASE_RPC_PROXY_PATH;
  return `${base}${STABLE_CLUB_BASE_RPC_PROXY_PATH}`;
}

/**
 * Ordered client read endpoints: configured proxy first, then optional public fallbacks.
 * Explicitly excludes https://mainnet.base.org.
 */
export function resolveStableClubBaseReadRpcUrls(params?: {
  origin?: string | null;
  /** Optional extra HTTPS endpoints (e.g. NEXT_PUBLIC_BASE_RPC_FALLBACK_URL). */
  extraFallbacks?: readonly string[];
}): string[] {
  const urls: string[] = [resolveStableClubBaseRpcProxyUrl(params?.origin)];
  for (const raw of params?.extraFallbacks ?? []) {
    const url = raw.trim();
    if (!url) continue;
    if (/^https:\/\/mainnet\.base\.org\/?$/i.test(url)) continue;
    if (!/^https:\/\//i.test(url)) continue;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

export function isRpcRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    /429|rate.?limit|too many requests|call rate limit|exceeded.*capacity|-32005/i.test(
      msg,
    ) || /status code 429/i.test(msg)
  );
}

export function formatStableClubRpcUserError(err: unknown): string {
  if (isRpcRateLimitError(err)) return STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|network|ECONNRESET|ETIMEDOUT|503|502|504/i.test(msg)) {
    return STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE;
  }
  return STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE;
}
