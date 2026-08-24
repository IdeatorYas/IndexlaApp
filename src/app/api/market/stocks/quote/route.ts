import { NextResponse } from "next/server";
import { fetchStockQuotes } from "@/lib/adapters/twelve-data";

/**
 * Server-only stock/ETF quotes via Twelve Data.
 * Auth: TWELVE_DATA_API_KEY (never exposed to the client).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw =
    searchParams.get("symbols") ??
    searchParams.get("tickers") ??
    searchParams.get("symbol") ??
    "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  if (symbols.length === 0) {
    return NextResponse.json(
      {
        bySymbol: {},
        availability: "error",
        reason: "Missing symbols query parameter",
      },
      { status: 400 },
    );
  }

  const result = await fetchStockQuotes(symbols);
  const status =
    result.availability === "unconfigured"
      ? 503
      : result.availability === "rate-limited"
        ? 429
        : 200;

  return NextResponse.json(
    {
      bySymbol: result.bySymbol,
      availability: result.availability,
      reason: result.reason,
      fetchedAt: new Date().toISOString(),
    },
    {
      status,
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
