import { NextResponse } from "next/server";
import { isDegenSolanaLiveEnabled } from "@/lib/degen-solana/constants";
import {
  assertSwapTxSize,
  fetchJupiterSwapTx,
  type JupiterQuoteResponse,
} from "@/lib/degen-solana/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userPublicKey: string;
  quoteResponse: JupiterQuoteResponse;
  feeAccount?: string;
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

  if (!body.userPublicKey || !body.quoteResponse) {
    return NextResponse.json(
      { error: "userPublicKey and quoteResponse required" },
      { status: 400 },
    );
  }

  try {
    const swap = await fetchJupiterSwapTx({
      quoteResponse: body.quoteResponse,
      userPublicKey: body.userPublicKey,
      feeAccount: body.feeAccount,
    });
    assertSwapTxSize(swap.swapTransaction);
    return NextResponse.json({
      swapTransaction: swap.swapTransaction,
      lastValidBlockHeight: swap.lastValidBlockHeight,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
