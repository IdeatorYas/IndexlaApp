import { NextResponse } from "next/server";
import { listCoinGeckoCategories } from "@/lib/adapters/coingecko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listCoinGeckoCategories();
  return NextResponse.json({
    availability: result.availability,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    reason: result.reason ?? null,
    categories: result.categories ?? [],
  });
}
