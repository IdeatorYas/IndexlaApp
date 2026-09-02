import { NextResponse } from "next/server";
import {
  fetchOfficialPoolApyQuotes,
  isCanonicalPoolApyId,
  isPoolApyStale,
  POOL_APY_RESPONSE_CACHE_MS,
  POOL_APY_STALE_AFTER_MS,
} from "@/lib/stable-club/pool-apy";

export const dynamic = "force-dynamic";

const BLOCKED_QUERY_KEYS = new Set([
  "url",
  "endpoint",
  "source",
  "rpc",
  "rpcUrl",
  "apiKey",
  "secret",
]);

function applyStaleGuard<T extends { status: string; updatedAt: string; apyPercent: number | null }>(
  quote: T,
): T {
  if (quote.status !== "available") return quote;
  if (isPoolApyStale(quote.updatedAt)) {
    return {
      ...quote,
      status: "unavailable",
      apyPercent: null,
      unavailableReason: `APY older than ${POOL_APY_STALE_AFTER_MS / 3_600_000}h`,
    } as T;
  }
  return quote;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (BLOCKED_QUERY_KEYS.has(key.toLowerCase())) {
      return NextResponse.json({ error: "Invalid query parameter" }, { status: 400 });
    }
  }

  const poolId = url.searchParams.get("poolId");
  if (poolId != null && poolId !== "" && !isCanonicalPoolApyId(poolId)) {
    return NextResponse.json({ error: "Unknown pool ID" }, { status: 400 });
  }

  try {
    const { quotes, fetchedAt } = await fetchOfficialPoolApyQuotes();
    const quotesWithStale = quotes.map((q) => applyStaleGuard(q));
    const filtered =
      poolId != null && poolId !== ""
        ? quotesWithStale.filter((q) => q.poolId === poolId)
        : quotesWithStale;

    return NextResponse.json(
      {
        source: "defillama-yields",
        fetchedAt,
        displayOnly: true,
        quotes: filtered,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=${Math.floor(POOL_APY_RESPONSE_CACHE_MS / 1000)}, stale-while-revalidate=60`,
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "APY fetch failed";
    return NextResponse.json({ error: message, quotes: [], source: "defillama-yields" }, { status: 503 });
  }
}
