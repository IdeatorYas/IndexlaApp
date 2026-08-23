import { NextResponse } from "next/server";
import { fetchAssetPerformance } from "@/lib/adapters/coingecko";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw =
    searchParams.get("tickers") ??
    searchParams.get("ids") ??
    searchParams.get("assets") ??
    "";
  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (tickers.length === 0) {
    return NextResponse.json(
      {
        byTicker: {},
        availability: "error",
        fetchedAt: new Date().toISOString(),
        stale: true,
        reason: "Missing tickers query parameter",
      },
      { status: 400 },
    );
  }

  const result = await fetchAssetPerformance(tickers);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
