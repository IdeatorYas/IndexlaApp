import { NextResponse } from "next/server";
import { isDegenSolanaLiveEnabled } from "@/lib/degen-solana/constants";
import type { JupiterQuoteResponse } from "@/lib/degen-solana/jupiter";
import { packSwapLegs, type PackLegInput } from "@/lib/degen-solana/pack-swaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userPublicKey: string;
  side?: "buy" | "sell";
  legs: Array<{
    key: string;
    ticker: string;
    quote: JupiterQuoteResponse;
    feeAccount?: string;
  }>;
};

export async function POST(req: Request) {
  if (!isDegenSolanaLiveEnabled()) {
    return NextResponse.json(
      { error: "Degen Solana live execution is disabled" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userPublicKey || !Array.isArray(body.legs) || body.legs.length === 0) {
    return NextResponse.json(
      { error: "userPublicKey and legs required" },
      { status: 400 },
    );
  }

  try {
    const legs: PackLegInput[] = body.legs.map((l) => ({
      key: l.key,
      ticker: l.ticker,
      quote: l.quote,
      feeAccount: l.feeAccount,
    }));
    const { packs, overflow } = await packSwapLegs({
      userPublicKey: body.userPublicKey,
      legs,
      side: body.side === "sell" ? "sell" : "buy",
    });
    return NextResponse.json({
      packs,
      overflowKeys: overflow.map((o) => o.key),
      overflowTickers: overflow.map((o) => o.ticker),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
