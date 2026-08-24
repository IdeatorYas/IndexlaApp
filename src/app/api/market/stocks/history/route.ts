import { NextResponse } from "next/server";
import { fetchStockDailyHistory } from "@/lib/adapters/twelve-data";

/**
 * Server-only daily history (trading-day closes) via Twelve Data.
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
    .slice(0, 20);

  const outputsizeRaw = Number(searchParams.get("outputsize") ?? "40");
  const outputsize = Number.isFinite(outputsizeRaw)
    ? Math.min(100, Math.max(10, Math.floor(outputsizeRaw)))
    : 40;

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

  const result = await fetchStockDailyHistory(symbols, outputsize);
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
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
