"use client";

import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, type Address } from "viem";
import { base } from "viem/chains";
import { quoteTokenToUsdcViaOracle } from "@/components/stable-club/usePositionUsdValue";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import { TRUSTED_PHASE2A_BASE_MANIFEST } from "@/lib/stable-club/trusted-phase2a-base-manifest";

const npmPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

export type ClaimableFeeRow = {
  legIndex: number;
  tokenId: string;
  amount0: bigint;
  amount1: bigint;
  token0: Address;
  token1: Address;
  approxUsdc: number;
};

/**
 * Read claimable trading fees (tokensOwed) from each position NFT.
 * USD via OracleGuard only (no hardcoded prices). Harvest stays gated.
 */
export function usePositionClaimableFees(
  positions: Array<{
    legIndex: number;
    npm: Address;
    positionTokenId: bigint;
  }>,
): { rows: ClaimableFeeRow[]; totalApproxUsdc: number; loading: boolean } {
  const [rows, setRows] = useState<ClaimableFeeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const key = positions
    .map((p) => `${p.legIndex}:${p.npm}:${p.positionTokenId.toString()}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    if (positions.length === 0) {
      setRows([]);
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
        const next: ClaimableFeeRow[] = [];
        for (const p of positions) {
          try {
            const result = await client.readContract({
              address: p.npm,
              abi: npmPositionsAbi,
              functionName: "positions",
              args: [p.positionTokenId],
            });
            const token0 = result[2] as Address;
            const token1 = result[3] as Address;
            const amount0 = BigInt(result[10]);
            const amount1 = BigInt(result[11]);
            const usdc0 = await quoteTokenToUsdcViaOracle({
              publicClient: client,
              oracleGuard,
              tokenIn: token0,
              amountIn: amount0,
            });
            const usdc1 = await quoteTokenToUsdcViaOracle({
              publicClient: client,
              oracleGuard,
              tokenIn: token1,
              amountIn: amount1,
            });
            next.push({
              legIndex: p.legIndex,
              tokenId: p.positionTokenId.toString(),
              amount0,
              amount1,
              token0,
              token1,
              approxUsdc: Number(formatUnits(usdc0 + usdc1, 6)),
            });
          } catch {
            next.push({
              legIndex: p.legIndex,
              tokenId: p.positionTokenId.toString(),
              amount0: 0n,
              amount1: 0n,
              token0: BASE_TOKENS.USDC.address,
              token1: BASE_TOKENS.WETH.address,
              approxUsdc: 0,
            });
          }
        }
        if (!cancelled) setRows(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const totalApproxUsdc = rows.reduce((a, r) => a + r.approxUsdc, 0);
  return { rows, totalApproxUsdc, loading };
}
