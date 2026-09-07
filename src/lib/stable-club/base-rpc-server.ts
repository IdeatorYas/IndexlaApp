/**
 * Server-only Base upstream RPC list for the Stable Club JSON-RPC proxy.
 * Prefer BASE_RPC_URL / QUICKNODE — never default to public mainnet.base.org.
 *
 * Last-resort public HTTPS endpoints (read-only proxy) keep position discovery
 * alive when QuikNode/Alchemy hit daily rate limits.
 */
import "server-only";

/** Free/public Base HTTPS RPCs — never mainnet.base.org. */
export const STABLE_CLUB_BASE_PUBLIC_FALLBACK_RPCS = [
  "https://base.publicnode.com",
  "https://base.llamarpc.com",
] as const;

export function resolveStableClubBaseUpstreamRpcUrls(): string[] {
  const urls: string[] = [];
  const push = (raw: string | null | undefined) => {
    const url = raw?.trim();
    if (!url) return;
    if (/^https:\/\/mainnet\.base\.org\/?$/i.test(url)) return;
    if (!/^https:\/\//i.test(url)) return;
    if (!urls.includes(url)) urls.push(url);
  };
  push(process.env.BASE_RPC_URL);
  push(process.env.QUICKNODE_RPC_URL);
  push(process.env.BASE_RPC_FALLBACK_URL);
  push(process.env.BASE_RPC_FALLBACK_URL_2);
  // Only attach public last-resorts when a primary paid/configured RPC exists.
  if (urls.length > 0) {
    for (const pub of STABLE_CLUB_BASE_PUBLIC_FALLBACK_RPCS) push(pub);
  }
  return urls;
}

/** Read-only eth_* / net_* methods allowed through the production proxy. */
export const STABLE_CLUB_BASE_RPC_ALLOWED_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);
