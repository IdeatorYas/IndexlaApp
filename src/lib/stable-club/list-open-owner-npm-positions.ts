/**
 * Fail-closed HTTP enumeration of open owner NPM positions on Base catalogue NPMs.
 * Used to gate residue→USDC and chain-derived Finish withdraw (no localStorage required).
 */
import { type Address, type PublicClient } from "viem";
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
} from "@/lib/stable-club/official-pools";

const erc721EnumerableAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const uniPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { type: "uint96" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "uint24" },
      { type: "int24" },
      { type: "int24" },
      { type: "uint128" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint128" },
      { type: "uint128" },
    ],
  },
] as const;

const aeroPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { type: "uint96" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "int24" },
      { type: "int24" },
      { type: "int24" },
      { type: "uint128" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint128" },
      { type: "uint128" },
    ],
  },
] as const;

export const OWNER_NPM_CATALOGUE = [
  {
    label: "aero-legacy",
    npm: BASE_DEX_AERODROME_LEGACY.npm as Address,
    protocol: "aerodrome-slipstream" as const,
  },
  {
    label: "aero-current",
    npm: BASE_DEX_AERODROME_CURRENT.npm as Address,
    protocol: "aerodrome-slipstream" as const,
  },
  {
    label: "uni-v3",
    npm: BASE_DEX_UNISWAP_V3.npm as Address,
    protocol: "uniswap-v3" as const,
  },
] as const;

export type OpenOwnerNpmPosition = {
  npm: Address;
  tokenId: bigint;
  liquidity: bigint;
  owed0: bigint;
  owed1: bigint;
  protocol: "aerodrome-slipstream" | "uniswap-v3";
  label: string;
};

export function positionKey(npm: Address, tokenId: bigint): string {
  return `${npm.toLowerCase()}:${tokenId.toString()}`;
}

export function isOpenOwnerNpmWork(row: {
  liquidity: bigint;
  owed0: bigint;
  owed1: bigint;
}): boolean {
  return row.liquidity > BigInt(0) || row.owed0 + row.owed1 > BigInt(0);
}

/**
 * Enumerate every owned NFT on catalogue NPMs with live liquidity or tokensOwed.
 * Throws on RPC/enumeration failure (fail closed — never coerce to empty).
 */
export async function listOpenOwnerNpmPositions(params: {
  publicClient: Pick<PublicClient, "readContract">;
  account: Address;
}): Promise<OpenOwnerNpmPosition[]> {
  const out: OpenOwnerNpmPosition[] = [];
  for (const row of OWNER_NPM_CATALOGUE) {
    let bal: bigint;
    try {
      bal = (await params.publicClient.readContract({
        address: row.npm,
        abi: erc721EnumerableAbi,
        functionName: "balanceOf",
        args: [params.account],
      })) as bigint;
    } catch (e) {
      throw new Error(
        `Failed to enumerate ${row.label} NPM balanceOf — refuse residue conversion. ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const posAbi =
      row.protocol === "uniswap-v3" ? uniPositionsAbi : aeroPositionsAbi;
    for (let i = BigInt(0); i < bal; i += BigInt(1)) {
      let tokenId: bigint;
      try {
        tokenId = (await params.publicClient.readContract({
          address: row.npm,
          abi: erc721EnumerableAbi,
          functionName: "tokenOfOwnerByIndex",
          args: [params.account, i],
        })) as bigint;
      } catch (e) {
        throw new Error(
          `Failed to enumerate ${row.label} tokenOfOwnerByIndex(${i}) — refuse residue. ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      let posRow: readonly unknown[];
      try {
        posRow = (await params.publicClient.readContract({
          address: row.npm,
          abi: posAbi,
          functionName: "positions",
          args: [tokenId],
        })) as readonly unknown[];
      } catch (e) {
        throw new Error(
          `Failed to read ${row.label} positions(${tokenId}) — refuse residue. ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      const liquidity = BigInt(posRow[7] as bigint);
      const owed0 = BigInt(posRow[10] as bigint);
      const owed1 = BigInt(posRow[11] as bigint);
      if (!isOpenOwnerNpmWork({ liquidity, owed0, owed1 })) continue;
      out.push({
        npm: row.npm,
        tokenId,
        liquidity,
        owed0,
        owed1,
        protocol: row.protocol,
        label: row.label,
      });
    }
  }
  return out;
}
