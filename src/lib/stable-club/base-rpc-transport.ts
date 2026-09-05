import { fallback, http, type Transport } from "viem";
import { resolveStableClubBaseReadRpcUrls } from "@/lib/stable-club/base-rpc-client";

/**
 * Viem transport for Stable Club Base browser reads:
 * same-origin proxy first, then optional HTTPS fallbacks — never mainnet.base.org.
 */
export function createStableClubBaseReadTransport(params?: {
  origin?: string | null;
  extraFallbacks?: readonly string[];
  retryCount?: number;
  timeout?: number;
}): Transport {
  const urls = resolveStableClubBaseReadRpcUrls({
    origin: params?.origin,
    extraFallbacks: params?.extraFallbacks,
  });
  const retryCount = params?.retryCount ?? 3;
  const timeout = params?.timeout ?? 20_000;
  const transports = urls.map((url) =>
    http(url, {
      retryCount,
      retryDelay: 300,
      timeout,
    }),
  );
  if (transports.length === 1) return transports[0]!;
  return fallback(transports, { rank: false });
}
