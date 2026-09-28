import { NextResponse } from "next/server";
import {
  DEGEN_SOLANA_BASKET,
  isDegenSolanaLiveEnabled,
  solanaRpcUrl,
} from "@/lib/degen-solana/constants";
import { readBasketBalances } from "@/lib/degen-solana/balances";
import { feeAccountsConfigured } from "@/lib/degen-solana/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner")?.trim();
  if (!owner) {
    return NextResponse.json({ error: "owner required" }, { status: 400 });
  }
  try {
    const { solLamports, tokens } = await readBasketBalances({
      owner,
      basket: DEGEN_SOLANA_BASKET,
    });
    const feeCfg = feeAccountsConfigured(DEGEN_SOLANA_BASKET);
    return NextResponse.json({
      live: isDegenSolanaLiveEnabled(),
      rpc: solanaRpcUrl().replace(/\/\/.*@/, "//***@"),
      feeConfigured: feeCfg.ok,
      feeMissing: feeCfg.missing,
      solLamports: solLamports.toString(),
      solUi: Number(solLamports) / 1e9,
      tokens: tokens.map((t) => ({
        ...t,
        amount: t.amount.toString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
