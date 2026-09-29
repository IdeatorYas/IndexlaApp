import { NextResponse } from "next/server";
import { isDegenSolanaLiveEnabled } from "@/lib/degen-solana/constants";
import type { JupiterQuoteResponse } from "@/lib/degen-solana/jupiter";
import { packSwapLegs, type PackLegInput } from "@/lib/degen-solana/pack-swaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userPublicKey: string;
  side?: "buy" | "sell";
  /** Sell 100%: close emptied token ATAs inside packs. */
  closeEmptiedAtas?: boolean;
  legs: Array<{
    key: string;
    ticker: string;
    mint: string;
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

  const missingMint = body.legs.find((l) => !l.mint);
  if (missingMint) {
    return NextResponse.json(
      { error: `${missingMint.ticker || missingMint.key} missing mint` },
      { status: 400 },
    );
  }

  try {
    const legs: PackLegInput[] = body.legs.map((l) => ({
      key: l.key,
      ticker: l.ticker,
      mint: l.mint,
      quote: l.quote,
      feeAccount: l.feeAccount,
    }));
    const { packs } = await packSwapLegs({
      userPublicKey: body.userPublicKey,
      legs,
      side: body.side === "sell" ? "sell" : "buy",
      closeEmptiedAtas: Boolean(body.closeEmptiedAtas),
    });
    return NextResponse.json({
      packs,
      packCount: packs.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
