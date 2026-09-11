import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import { BASE_DEX_AERODROME_CURRENT } from "@/lib/stable-club/official-pools";
import {
  OWNER_NPM_MULTICALL_GAS_FLOOR,
  OWNER_NPM_MULTICALL_SELECTOR,
  applyOwnerNpmMulticallGasBuffer,
  parseHexGasQuantity,
} from "@/lib/stable-club/owner-npm-multicall-gas";
import { wrapProviderForceOwnerNpmMulticallGas } from "@/lib/stable-club/force-owner-npm-multicall-gas-provider";

const multicallData = encodeFunctionData({
  abi: [
    {
      type: "function",
      name: "multicall",
      stateMutability: "payable",
      inputs: [{ name: "data", type: "bytes[]" }],
      outputs: [{ name: "results", type: "bytes[]" }],
    },
  ] as const,
  functionName: "multicall",
  args: [["0x01" as `0x${string}`]],
});

describe("wrapProviderForceOwnerNpmMulticallGas", () => {
  it("inflates eth_estimateGas for Aero NPM multicall", async () => {
    const rawEstimate = BigInt(429_802); // live OOG gasUsed==gasLimit on 0xd73deb70…
    const inner = {
      request: vi.fn(async (args: { method: string }) => {
        if (args.method === "eth_estimateGas") {
          return `0x${rawEstimate.toString(16)}`;
        }
        throw new Error(`unexpected ${args.method}`);
      }),
    };
    const wrapped = wrapProviderForceOwnerNpmMulticallGas(inner);
    const out = (await wrapped.request({
      method: "eth_estimateGas",
      params: [
        {
          to: BASE_DEX_AERODROME_CURRENT.npm,
          data: multicallData,
        },
      ],
    })) as string;
    expect(multicallData.slice(0, 10).toLowerCase()).toBe(
      OWNER_NPM_MULTICALL_SELECTOR,
    );
    expect(parseHexGasQuantity(out)).toBe(
      applyOwnerNpmMulticallGasBuffer(rawEstimate),
    );
    expect(parseHexGasQuantity(out)!).toBeGreaterThanOrEqual(
      OWNER_NPM_MULTICALL_GAS_FLOOR,
    );
  });

  it("forces eth_sendTransaction gas when wallet would submit a tight estimate", async () => {
    const tight = BigInt(429_802);
    const inner = {
      request: vi.fn(async (args: { method: string; params?: unknown }) => {
        const tx = (args.params as [{ gas: string }])[0];
        return { gas: tx.gas };
      }),
    };
    const wrapped = wrapProviderForceOwnerNpmMulticallGas(inner);
    const result = (await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          to: BASE_DEX_AERODROME_CURRENT.npm,
          data: multicallData,
          gas: `0x${tight.toString(16)}`,
        },
      ],
    })) as { gas: string };
    const forced = parseHexGasQuantity(result.gas)!;
    expect(forced).toBe(applyOwnerNpmMulticallGasBuffer(tight));
    expect(forced).toBeGreaterThanOrEqual(OWNER_NPM_MULTICALL_GAS_FLOOR);
    expect(forced).toBeGreaterThan(tight);
  });
});
