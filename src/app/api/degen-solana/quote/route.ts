import { NextResponse } from "next/server";
import {
  ATA_RENT_LAMPORTS,
  DEGEN_SOLANA_BASKET,
  DEFAULT_SLIPPAGE_BPS,
  IMPACT_SOFT,
  INDEXLA_FEE_BPS,
  MAX_SLIPPAGE_BPS,
  MIN_LEG_LAMPORTS,
  MIN_SLIPPAGE_BPS,
  PRIORITY_FEE_RESERVE_LAMPORTS,
  WSOL_MINT,
  isDegenSolanaLiveEnabled,
} from "@/lib/degen-solana/constants";
import {
  assertImpactAllowed,
  equalLamportSplits,
  feeAccountsConfigured,
  fetchJupiterQuote,
  parseImpactPct,
  readFeeAccountMap,
  weightedLamportSplits,
} from "@/lib/degen-solana/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  side: "buy" | "sell";
  /** Buy: total SOL lamports user wants to spend (gross). */
  solLamports?: string;
  /** Sell: map mint → raw amount (omit to use provided amounts only). */
  sellAmounts?: Record<string, string>;
  slippageBps?: number;
  allowHardImpact?: boolean;
  /** Resume: only these mint keys. */
  onlyKeys?: string[];
  /**
   * Buy: percent weights aligned to basket order (or onlyKeys order).
   * Must sum to 100. When omitted, equal split.
   */
  weightsPct?: number[];
  /** Mint keys whose ATAs already exist — rent reserved only for the rest. */
  existingAtaKeys?: string[];
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

  const slippageBps = Math.min(
    MAX_SLIPPAGE_BPS,
    Math.max(MIN_SLIPPAGE_BPS, body.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
  );

  const feeCfg = feeAccountsConfigured(DEGEN_SOLANA_BASKET);
  const feeMap = readFeeAccountMap();
  // Demo / unset: force 0 bps. Never block testing on missing fee accounts.
  const feeBpsEnv = process.env.DEGEN_SOLANA_FEE_BPS?.trim();
  const forceZero =
    feeBpsEnv === "0" ||
    process.env.DEGEN_SOLANA_FORCE_ZERO_FEE === "1" ||
    process.env.DEGEN_SOLANA_FORCE_ZERO_FEE?.toLowerCase() === "true";
  const takeFees = !forceZero && feeCfg.ok && feeBpsEnv !== "0";
  const platformFeeBps = takeFees
    ? Number(feeBpsEnv || INDEXLA_FEE_BPS) || INDEXLA_FEE_BPS
    : 0;

  const basket = body.onlyKeys?.length
    ? DEGEN_SOLANA_BASKET.filter((m) => body.onlyKeys!.includes(m.key))
    : [...DEGEN_SOLANA_BASKET];

  if (basket.length === 0) {
    return NextResponse.json({ error: "No legs to quote" }, { status: 400 });
  }

  try {
    if (body.side === "buy") {
      const gross = BigInt(body.solLamports ?? "0");
      if (gross <= BigInt(0)) {
        return NextResponse.json(
          { error: "solLamports required for buy" },
          { status: 400 },
        );
      }
      const existing = new Set(body.existingAtaKeys ?? []);
      const missingAtaCount = basket.filter((m) => !existing.has(m.key)).length;
      const rentReserve =
        ATA_RENT_LAMPORTS * BigInt(missingAtaCount) +
        PRIORITY_FEE_RESERVE_LAMPORTS;
      if (gross <= rentReserve) {
        return NextResponse.json(
          {
            error: `Need more SOL: reserve ~${Number(rentReserve) / 1e9} SOL for rent+fees`,
          },
          { status: 400 },
        );
      }
      const investable = gross - rentReserve;
      const perLeg = investable / BigInt(basket.length);
      if (perLeg < MIN_LEG_LAMPORTS) {
        return NextResponse.json(
          {
            error: `Per-asset notional too small (~${Number(perLeg) / 1e9} SOL). Increase SOL amount or finish fewer remaining legs.`,
          },
          { status: 400 },
        );
      }
      const splits =
        body.weightsPct && body.weightsPct.length === basket.length
          ? weightedLamportSplits(investable, body.weightsPct)
          : equalLamportSplits(investable, basket.length);
      const legs = [];
      for (let i = 0; i < basket.length; i += 1) {
        const m = basket[i]!;
        const amountIn = splits[i]!;
        if (amountIn <= BigInt(0)) continue;
        if (amountIn < MIN_LEG_LAMPORTS) {
          return NextResponse.json(
            {
              error: `${m.ticker} allocation too small (~${Number(amountIn) / 1e9} SOL). Rebalance % or add SOL.`,
            },
            { status: 400 },
          );
        }
        const quote = await fetchJupiterQuote({
          inputMint: WSOL_MINT,
          outputMint: m.mint,
          amount: amountIn,
          slippageBps,
          platformFeeBps,
          onlyDirectRoutes: true,
        });
        assertImpactAllowed(quote, { allowHard: body.allowHardImpact });
        legs.push({
          key: m.key,
          ticker: m.ticker,
          mint: m.mint,
          amountIn: amountIn.toString(),
          quote,
          impactPct: parseImpactPct(quote),
          impactSoft: parseImpactPct(quote) > IMPACT_SOFT,
          // ExactIn platform fee is taken from the OUTPUT mint.
          feeAccount: takeFees ? feeMap[m.mint] : undefined,
        });
      }
      return NextResponse.json({
        side: "buy",
        slippageBps,
        platformFeeBps,
        feeConfigured: takeFees,
        feeMissing: feeCfg.missing,
        rentReserveLamports: rentReserve.toString(),
        investableLamports: investable.toString(),
        missingAtaCount,
        legs,
      });
    }

    // sell
    const sellAmounts = body.sellAmounts ?? {};
    const legs = [];
    for (const m of basket) {
      const raw = sellAmounts[m.mint] ?? sellAmounts[m.key];
      if (!raw) continue;
      const amountIn = BigInt(raw);
      if (amountIn <= BigInt(0)) continue;
      const quote = await fetchJupiterQuote({
        inputMint: m.mint,
        outputMint: WSOL_MINT,
        amount: amountIn,
        slippageBps,
        platformFeeBps,
        onlyDirectRoutes: true,
      });
      assertImpactAllowed(quote, { allowHard: body.allowHardImpact });
      legs.push({
        key: m.key,
        ticker: m.ticker,
        mint: m.mint,
        amountIn: amountIn.toString(),
        quote,
        impactPct: parseImpactPct(quote),
        impactSoft: parseImpactPct(quote) > IMPACT_SOFT,
        // ExactIn platform fee is taken from the OUTPUT mint (WSOL on sells).
        feeAccount: takeFees ? feeMap[WSOL_MINT] : undefined,
      });
    }
    if (legs.length === 0) {
      return NextResponse.json(
        { error: "No sellable balances provided" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      side: "sell",
      slippageBps,
      platformFeeBps,
      feeConfigured: takeFees,
      feeMissing: feeCfg.missing,
      legs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
