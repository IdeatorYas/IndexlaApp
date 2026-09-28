import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { isDegenSolanaLiveEnabled } from "@/lib/degen-solana/constants";
import {
  assertSwapTxSize,
  fetchJupiterSwapTx,
  type JupiterQuoteResponse,
} from "@/lib/degen-solana/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LegBody = {
  key: string;
  ticker?: string;
  mint: string;
  quoteResponse: JupiterQuoteResponse;
  feeAccount?: string;
};

type Body = {
  userPublicKey: string;
  side: "buy" | "sell";
  /** Single-leg (legacy) */
  quoteResponse?: JupiterQuoteResponse;
  feeAccount?: string;
  mint?: string;
  key?: string;
  /** Multi-leg: one canonical Jupiter /swap per asset */
  legs?: LegBody[];
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

  if (!body.userPublicKey) {
    return NextResponse.json(
      { error: "userPublicKey required" },
      { status: 400 },
    );
  }

  const legs: LegBody[] =
    body.legs?.length
      ? body.legs
      : body.quoteResponse
        ? [
            {
              key: body.key ?? "leg",
              mint: body.mint ?? "",
              quoteResponse: body.quoteResponse,
              feeAccount: body.feeAccount,
            },
          ]
        : [];

  if (legs.length === 0) {
    return NextResponse.json(
      { error: "legs or quoteResponse required" },
      { status: 400 },
    );
  }

  try {
    const owner = new PublicKey(body.userPublicKey);
    const built = [];
    for (const leg of legs) {
      let destinationTokenAccount: string | undefined;
      if (body.side === "buy" && leg.mint) {
        destinationTokenAccount = getAssociatedTokenAddressSync(
          new PublicKey(leg.mint),
          owner,
          false,
        ).toBase58();
      }
      const swap = await fetchJupiterSwapTx({
        quoteResponse: leg.quoteResponse,
        userPublicKey: body.userPublicKey,
        feeAccount: leg.feeAccount,
        destinationTokenAccount,
      });
      assertSwapTxSize(swap.swapTransaction);
      built.push({
        key: leg.key,
        ticker: leg.ticker,
        mint: leg.mint,
        swapTransaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight,
      });
    }
    return NextResponse.json({ legs: built });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
