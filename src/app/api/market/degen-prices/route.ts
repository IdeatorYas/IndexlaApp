import { NextResponse } from "next/server";
import { fetchDegenClubPrices } from "@/lib/adapters/coingecko";
import { getAllDegenCoingeckoIds } from "@/lib/fixtures/degen-club";

/**
 * Live CoinGecko logos, market cap, and 7D/30D for all Degen Club registry assets.
 * Product AUM, 30D product performance, and investor counts remain illustrative.
 */
export async function GET() {
  const ids = getAllDegenCoingeckoIds();
  const result = await fetchDegenClubPrices(ids);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
