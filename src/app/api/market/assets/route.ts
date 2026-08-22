import { NextResponse } from "next/server";
import { listMarketAssets } from "@/lib/adapters/coingecko";
import { INDEX_CATEGORIES } from "@/lib/domain/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const narrative = searchParams.get("narrative");
  const category = searchParams.get("category");
  const query = searchParams.get("q") ?? undefined;
  const network = searchParams.get("network");
  const includeTokenized = searchParams.get("tokenized") !== "0";

  let coingeckoCategoryId = category;
  if (narrative) {
    const match = INDEX_CATEGORIES.find((c) => c.id === narrative);
    coingeckoCategoryId = match?.coingeckoCategoryId ?? category;
  }

  const result = await listMarketAssets({
    coingeckoCategoryId,
    query,
    network,
    includeTokenized,
  });

  return NextResponse.json({
    availability: result.availability,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    reason: result.reason ?? null,
    assets: result.assets,
    note: "CoinGecko-listed does not automatically mean INDEXLA-supported.",
  });
}
