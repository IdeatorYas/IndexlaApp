/**
 * Shared Solana JSON-RPC upstream fetch with Retry-After / backoff / fallback.
 * Used by /api/degen-solana/rpc and server-side Connection (packing, balances).
 */

import {
  solanaRpcFallbackUrl,
  solanaRpcUrl,
} from "@/lib/degen-solana/constants";

export function solanaRpcEndpoints(): string[] {
  const primary = solanaRpcUrl();
  const fallback = solanaRpcFallbackUrl();
  if (fallback && fallback !== primary) return [primary, fallback];
  return [primary];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const asInt = Number(raw);
  if (Number.isFinite(asInt) && asInt >= 0) {
    // Seconds (typical) — clamp 0.2s–30s
    return Math.min(30_000, Math.max(200, asInt * 1000));
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.min(30_000, Math.max(200, when - Date.now()));
  }
  return null;
}

function isRateLimitedBody(text: string): boolean {
  return /429|rate limit|rate.?limits? exceeded|too many requests|connection rate limits/i.test(
    text,
  );
}

export type UpstreamRpcResult = {
  status: number;
  text: string;
  endpointIndex: number;
};

/**
 * POST one JSON-RPC body to primary, then fallback on 429/5xx.
 * Honours Retry-After; bounded exponential backoff; never parallel storms.
 */
export async function fetchSolanaJsonRpc(
  body: unknown,
  opts?: { maxAttemptsPerEndpoint?: number },
): Promise<UpstreamRpcResult> {
  const endpoints = solanaRpcEndpoints();
  const maxPer = opts?.maxAttemptsPerEndpoint ?? 4;
  let last: UpstreamRpcResult | null = null;

  for (let ei = 0; ei < endpoints.length; ei += 1) {
    const url = endpoints[ei]!;
    for (let attempt = 0; attempt < maxPer; attempt += 1) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        last = {
          status: 502,
          text: JSON.stringify({
            jsonrpc: "2.0",
            id: (body as { id?: unknown })?.id ?? null,
            error: { code: -32000, message: msg },
          }),
          endpointIndex: ei,
        };
        if (attempt < maxPer - 1) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        break; // try fallback
      }

      const text = await res.text();
      last = { status: res.status, text, endpointIndex: ei };

      const rpcBusy =
        res.status === 429 ||
        res.status === 503 ||
        (res.ok && isRateLimitedBody(text));

      if (!rpcBusy && res.status < 500) {
        return last;
      }

      if (attempt < maxPer - 1) {
        const retryAfter = parseRetryAfterMs(res);
        const backoff = retryAfter ?? 500 * 2 ** attempt + Math.floor(Math.random() * 200);
        await sleep(Math.min(30_000, backoff));
        continue;
      }
      // Exhausted this endpoint — try fallback if any
    }
  }

  return (
    last ?? {
      status: 502,
      text: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "No Solana RPC endpoint configured" },
      }),
      endpointIndex: 0,
    }
  );
}

/**
 * Custom fetch for @solana/web3.js Connection — routes every call through
 * bounded backoff + fallback so packing/balances don't die on a single 429.
 */
export function createSolanaRpcFetch(): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    // Connection always POSTs JSON-RPC to the configured endpoint URL.
    let body: unknown = undefined;
    if (init?.body) {
      try {
        body =
          typeof init.body === "string"
            ? JSON.parse(init.body)
            : init.body;
      } catch {
        body = undefined;
      }
    }
    if (body == null) {
      // Non-JSON or empty — pass through primary once
      return fetch(url, init);
    }

    // Ignore Connection's URL; use our endpoint list (primary may differ from fallback).
    const result = await fetchSolanaJsonRpc(body);
    return new Response(result.text, {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
