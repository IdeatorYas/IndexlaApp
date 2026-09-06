"use client";

import { useEffect, useState } from "react";
import { createPublicClient, type Address } from "viem";
import { base } from "viem/chains";
import { oracleGuardAbi } from "@/lib/stable-club/abis";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import { TRUSTED_PHASE2A_BASE_MANIFEST } from "@/lib/stable-club/trusted-phase2a-base-manifest";

function decimalsFor(token: Address): number {
  const a = token.toLowerCase();
  if (a === BASE_TOKENS.USDC.address.toLowerCase()) return 6;
  if (a === BASE_TOKENS.cbBTC.address.toLowerCase()) return 8;
  return 18;
}

/**
 * Live OracleGuard USD (USDC-6) for Base token amounts. No hardcoded prices.
 */
export async function quoteTokenToUsdcViaOracle(params: {
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof oracleGuardAbi;
      functionName: "expectedAmountOut";
      args: readonly [Address, Address, bigint, number, number];
    }) => Promise<bigint>;
  };
  oracleGuard: Address;
  tokenIn: Address;
  amountIn: bigint;
}): Promise<bigint> {
  if (params.amountIn <= 0n) return 0n;
  if (params.tokenIn.toLowerCase() === BASE_TOKENS.USDC.address.toLowerCase()) {
    return params.amountIn;
  }
  return params.publicClient.readContract({
    address: params.oracleGuard,
    abi: oracleGuardAbi,
    functionName: "expectedAmountOut",
    args: [
      params.tokenIn,
      BASE_TOKENS.USDC.address,
      params.amountIn,
      decimalsFor(params.tokenIn),
      6,
    ],
  });
}

export type PositionUsdRow = {
  legIndex: number;
  valueUsdc: bigint;
};

/**
 * Sum of live position principal in USDC via OracleGuard (display + exit previews).
 */
export function usePositionUsdValue(
  positions: Array<{
    legIndex: number;
    tokenA: Address;
    tokenB: Address;
    amountA: bigint;
    amountB: bigint;
  }>,
): {
  rows: PositionUsdRow[];
  totalUsdc: bigint | null;
  loading: boolean;
  source: "oracle-guard" | null;
} {
  const [rows, setRows] = useState<PositionUsdRow[]>([]);
  const [totalUsdc, setTotalUsdc] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"oracle-guard" | null>(null);

  const key = positions
    .map(
      (p) =>
        `${p.legIndex}:${p.tokenA}:${p.amountA.toString()}:${p.tokenB}:${p.amountB.toString()}`,
    )
    .join("|");

  useEffect(() => {
    let cancelled = false;
    if (positions.length === 0) {
      setRows([]);
      setTotalUsdc(null);
      setSource(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const client = createPublicClient({
          chain: base,
          transport: createStableClubBaseReadTransport({
            origin: typeof window !== "undefined" ? window.location.origin : null,
          }),
        });
        const oracleGuard = TRUSTED_PHASE2A_BASE_MANIFEST.contracts
          .oracleGuard as Address;
        const next: PositionUsdRow[] = [];
        let sum = 0n;
        for (const p of positions) {
          const a = await quoteTokenToUsdcViaOracle({
            publicClient: client,
            oracleGuard,
            tokenIn: p.tokenA,
            amountIn: p.amountA,
          });
          const b = await quoteTokenToUsdcViaOracle({
            publicClient: client,
            oracleGuard,
            tokenIn: p.tokenB,
            amountIn: p.amountB,
          });
          const valueUsdc = a + b;
          next.push({ legIndex: p.legIndex, valueUsdc });
          sum += valueUsdc;
        }
        if (!cancelled) {
          setRows(next);
          setTotalUsdc(sum);
          setSource("oracle-guard");
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotalUsdc(null);
          setSource(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { rows, totalUsdc, loading, source };
}
