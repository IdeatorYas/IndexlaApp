/**
 * Protocol-specific CL pool `slot0()` ABI routing.
 * Uniswap V3: 7 outputs (includes packed `feeProtocol`).
 * Aerodrome Slipstream: 6 outputs (no `feeProtocol`).
 * Tick is always at return index 1 when the matching ABI is used.
 */
import { getAddress, isAddress, type Address } from "viem";
import {
  aerodromeSlipstreamPoolSlot0Abi,
  uniswapV3PoolSlot0Abi,
} from "@/lib/stable-club/abis";
import { STABLE_CLUB_LOCAL_CHAIN_ID } from "@/lib/stable-club/constants";
import { ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  type StableClubProtocol,
} from "@/lib/stable-club/official-pools";

export type ClPoolSlot0Abi =
  | typeof uniswapV3PoolSlot0Abi
  | typeof aerodromeSlipstreamPoolSlot0Abi;

export type Slot0PoolRef = {
  id: string;
  protocol: StableClubProtocol;
  poolAddress: Address | null;
};

export function slot0AbiForProtocol(protocol: StableClubProtocol): ClPoolSlot0Abi {
  switch (protocol) {
    case "uniswap-v3":
      return uniswapV3PoolSlot0Abi;
    case "aerodrome-slipstream":
      return aerodromeSlipstreamPoolSlot0Abi;
    default: {
      const _exhaustive: never = protocol;
      throw new Error(`Unsupported protocol for slot0: ${String(_exhaustive)}`);
    }
  }
}

/** Extract tick at word index 1 — never coerce missing/invalid values to 0. */
export function tickFromSlot0Result(slot0: readonly unknown[]): number {
  if (!Array.isArray(slot0) || slot0.length < 2) {
    throw new Error(
      `slot0 result missing tick at index 1 (length=${Array.isArray(slot0) ? slot0.length : "n/a"})`,
    );
  }
  const raw = slot0[1];
  if (typeof raw !== "number" && typeof raw !== "bigint") {
    throw new Error(`Invalid slot0 tick type at index 1: ${typeof raw}`);
  }
  const tick = Number(raw);
  if (!Number.isFinite(tick) || !Number.isInteger(tick)) {
    throw new Error(`Non-integer slot0 tick: ${String(raw)}`);
  }
  return tick;
}

export type PoolSlot0State = {
  tick: number;
  sqrtPriceX96: bigint;
};

/** Extract sqrtPriceX96 at word index 0 — never coerce missing/invalid values to 0. */
export function sqrtPriceX96FromSlot0Result(slot0: readonly unknown[]): bigint {
  if (!Array.isArray(slot0) || slot0.length < 1) {
    throw new Error(
      `slot0 result missing sqrtPriceX96 at index 0 (length=${Array.isArray(slot0) ? slot0.length : "n/a"})`,
    );
  }
  const raw = slot0[0];
  if (typeof raw !== "bigint" && typeof raw !== "number") {
    throw new Error(`Invalid slot0 sqrtPriceX96 type at index 0: ${typeof raw}`);
  }
  const sqrtPriceX96 = typeof raw === "bigint" ? raw : BigInt(raw);
  if (sqrtPriceX96 <= 0n) {
    throw new Error(`Invalid slot0 sqrtPriceX96: ${sqrtPriceX96.toString()}`);
  }
  return sqrtPriceX96;
}

export type Slot0PublicClient = {
  readContract: (args: {
    address: Address;
    abi: ClPoolSlot0Abi;
    functionName: "slot0";
  }) => Promise<readonly unknown[]>;
};

/**
 * Read live pool ticks + sqrtPriceX96 for quote/range/mint-min planning.
 * SC-F03: RPC/slot0 failures fail closed — never substitute tick/price zero.
 */
export async function readPoolSlot0States(
  publicClient: Slot0PublicClient,
  network: string,
  chainId: number,
  pools: readonly Slot0PoolRef[] = OFFICIAL_STABLE_CLUB_BASE_POOLS,
): Promise<PoolSlot0State[]> {
  const allowNoRpcTickZero =
    network === "hardhat-local" && chainId === STABLE_CLUB_LOCAL_CHAIN_ID;
  const states: PoolSlot0State[] = [];

  for (const pool of pools) {
    if (allowNoRpcTickZero) {
      // Local mock path — tick 0 with corresponding sqrt ratio.
      states.push({ tick: 0, sqrtPriceX96: 2n ** 96n });
      continue;
    }

    const poolAddress = pool.poolAddress;
    if (
      !poolAddress ||
      !isAddress(poolAddress) ||
      getAddress(poolAddress) === getAddress(ZERO_ADDRESS)
    ) {
      throw new Error(
        `Missing or invalid poolAddress for live tick read on pool ${pool.id}` +
          (poolAddress ? ` (${poolAddress})` : ""),
      );
    }

    if (pool.protocol !== "uniswap-v3" && pool.protocol !== "aerodrome-slipstream") {
      throw new Error(
        `Unsupported protocol for live tick read on pool ${pool.id}: ${String(
          (pool as Slot0PoolRef).protocol,
        )}`,
      );
    }

    const abi = slot0AbiForProtocol(pool.protocol);
    try {
      const slot0 = await publicClient.readContract({
        address: poolAddress,
        abi,
        functionName: "slot0",
      });
      states.push({
        tick: tickFromSlot0Result(slot0),
        sqrtPriceX96: sqrtPriceX96FromSlot0Result(slot0),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to read current tick for pool ${pool.id} (${poolAddress}): ${detail}`,
      );
    }
  }
  return states;
}

/**
 * Read live pool ticks for quote/range planning.
 * SC-F03: RPC/slot0 failures fail closed — never substitute tick 0.
 * Legitimate on-chain tick 0 is still returned when slot0 succeeds.
 * Only verified local Hardhat (network hardhat-local + chainId 31337) may use
 * intentional tick 0 without an RPC read.
 */
export async function readCurrentTicks(
  publicClient: Slot0PublicClient,
  network: string,
  chainId: number,
  pools: readonly Slot0PoolRef[] = OFFICIAL_STABLE_CLUB_BASE_POOLS,
): Promise<number[]> {
  const states = await readPoolSlot0States(publicClient, network, chainId, pools);
  return states.map((s) => s.tick);
}
