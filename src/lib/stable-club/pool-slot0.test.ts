/**
 * Protocol-specific slot0 ABI regression + live tick read for Aerodrome CL100.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionResult,
  http,
  type Address,
} from "viem";
import { base } from "viem/chains";
import {
  aerodromeSlipstreamPoolSlot0Abi,
  uniswapV3PoolSlot0Abi,
} from "@/lib/stable-club/abis";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  USDC_CBBTC_AERO_CL100_POOL,
} from "@/lib/stable-club/official-pools";
import {
  readCurrentTicks,
  slot0AbiForProtocol,
  tickFromSlot0Result,
} from "@/lib/stable-club/pool-slot0";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    process.env[key] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const UNI_TICK = -123_456;
const AERO_TICK = 78_901;
const SQRT = 79228162514264337593543950336n; // 2^96

describe("slot0 ABI formats", () => {
  it("Uniswap V3 slot0 has 7 outputs including feeProtocol", () => {
    const abi = slot0AbiForProtocol("uniswap-v3");
    expect(abi).toBe(uniswapV3PoolSlot0Abi);
    const outputs = abi[0].outputs;
    expect(outputs).toHaveLength(7);
    expect(outputs.map((o) => o.name)).toEqual([
      "sqrtPriceX96",
      "tick",
      "observationIndex",
      "observationCardinality",
      "observationCardinalityNext",
      "feeProtocol",
      "unlocked",
    ]);
  });

  it("Aerodrome Slipstream slot0 has 6 outputs and no feeProtocol", () => {
    const abi = slot0AbiForProtocol("aerodrome-slipstream");
    expect(abi).toBe(aerodromeSlipstreamPoolSlot0Abi);
    const outputs = abi[0].outputs;
    expect(outputs).toHaveLength(6);
    expect(outputs.map((o) => o.name)).toEqual([
      "sqrtPriceX96",
      "tick",
      "observationIndex",
      "observationCardinality",
      "observationCardinalityNext",
      "unlocked",
    ]);
    expect(outputs.some((o) => o.name === "feeProtocol")).toBe(false);
  });

  it("decodes Uniswap V3 7-output return data and extracts tick", () => {
    const data = encodeFunctionResult({
      abi: uniswapV3PoolSlot0Abi,
      functionName: "slot0",
      result: [SQRT, UNI_TICK, 0, 1, 1, 0, true],
    });
    expect((data.length - 2) / 2).toBe(7 * 32);
    const decoded = decodeFunctionResult({
      abi: uniswapV3PoolSlot0Abi,
      functionName: "slot0",
      data,
    });
    expect(tickFromSlot0Result(decoded)).toBe(UNI_TICK);
  });

  it("decodes Aerodrome Slipstream 6-output return data and extracts tick", () => {
    const data = encodeFunctionResult({
      abi: aerodromeSlipstreamPoolSlot0Abi,
      functionName: "slot0",
      result: [SQRT, AERO_TICK, 0, 1, 1, true],
    });
    expect((data.length - 2) / 2).toBe(6 * 32);
    const decoded = decodeFunctionResult({
      abi: aerodromeSlipstreamPoolSlot0Abi,
      functionName: "slot0",
      data,
    });
    expect(tickFromSlot0Result(decoded)).toBe(AERO_TICK);
  });

  it("Slipstream 6-word data fails closed under Uniswap V3 7-output ABI", () => {
    const data = encodeFunctionResult({
      abi: aerodromeSlipstreamPoolSlot0Abi,
      functionName: "slot0",
      result: [SQRT, AERO_TICK, 0, 1, 1, true],
    });
    expect(() =>
      decodeFunctionResult({
        abi: uniswapV3PoolSlot0Abi,
        functionName: "slot0",
        data,
      }),
    ).toThrow();
  });

  it("tickFromSlot0Result never substitutes missing tick with zero", () => {
    expect(() => tickFromSlot0Result([])).toThrow(/missing tick/);
    expect(() => tickFromSlot0Result([SQRT])).toThrow(/missing tick/);
    expect(() => tickFromSlot0Result([SQRT, "bad"])).toThrow(/Invalid slot0 tick type/);
  });
});

describe("readCurrentTicks ABI routing", () => {
  it("passes protocol-specific ABI for each catalogue pool", async () => {
    const seen: { id: string; outputCount: number; hasFeeProtocol: boolean }[] = [];
    const client = {
      readContract: async (args: {
        address: Address;
        abi: typeof uniswapV3PoolSlot0Abi | typeof aerodromeSlipstreamPoolSlot0Abi;
        functionName: "slot0";
      }) => {
        const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
          (p) => p.poolAddress?.toLowerCase() === args.address.toLowerCase(),
        )!;
        const outputs = args.abi[0].outputs;
        seen.push({
          id: pool.id,
          outputCount: outputs.length,
          hasFeeProtocol: outputs.some((o) => o.name === "feeProtocol"),
        });
        if (pool.protocol === "uniswap-v3") {
          return [SQRT, 1, 0, 1, 1, 0, true] as const;
        }
        return [SQRT, 2, 0, 1, 1, true] as const;
      },
    };
    await readCurrentTicks(client, "base", 8453);
    expect(seen).toEqual(
      OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((p) => p.poolAddress).map((p) => ({
        id: p.id,
        outputCount: p.protocol === "uniswap-v3" ? 7 : 6,
        hasFeeProtocol: p.protocol === "uniswap-v3",
      })),
    );
  });
});

const hasBaseRpc = Boolean(process.env.BASE_RPC_URL?.trim());

describe.runIf(hasBaseRpc)("live Base slot0 tick read", () => {
  it("reads non-substituted tick for USDC-cbBTC-AERO-CL100 (0x4e962bb...)", async () => {
    expect(USDC_CBBTC_AERO_CL100_POOL.toLowerCase()).toBe(
      "0x4e962bb3889bf030368f56810a9c96b83cb3e778",
    );
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });

    // Wrong ABI must fail — never catch/substitute tick 0.
    await expect(
      client.readContract({
        address: USDC_CBBTC_AERO_CL100_POOL,
        abi: uniswapV3PoolSlot0Abi,
        functionName: "slot0",
      }),
    ).rejects.toThrow();

    const ticks = await readCurrentTicks(client, "base", 8453, [
      {
        id: "USDC-cbBTC-AERO-CL100",
        protocol: "aerodrome-slipstream",
        poolAddress: USDC_CBBTC_AERO_CL100_POOL,
      },
    ]);
    expect(ticks).toHaveLength(1);
    expect(Number.isInteger(ticks[0])).toBe(true);

    const raw = await client.call({
      to: USDC_CBBTC_AERO_CL100_POOL,
      data: "0x3850c7bd",
    });
    const hex = raw.data ?? "0x";
    expect((hex.length - 2) / 2).toBe(6 * 32);
    const tickWord = BigInt(`0x${hex.slice(66, 130)}`);
    const expected =
      tickWord >= 1n << 255n ? Number(tickWord - (1n << 256n)) : Number(tickWord);
    expect(ticks[0]).toBe(expected);
    // Guard against accidental zero-substitution on this live pool.
    expect(ticks[0]).not.toBe(0);
  });
});
