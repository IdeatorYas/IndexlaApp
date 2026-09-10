import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, getAddress } from "viem";
import { BASE_DEX_UNISWAP_V3, BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  buildUniResidueSweepMulticallData,
} from "@/lib/stable-club/recover-loose-assets";
import {
  MULTICALL_DEADLINE_SELECTOR,
  RECOVER_MAX_APPROVE_AMOUNT,
  RECOVER_SWEEP_GAS_FLOOR,
  isRecoverSweepMulticallCall,
  forceRecoverTxGas,
} from "@/lib/stable-club/recover-swap-gas";
import { wrapProviderForceRecoverGas } from "@/lib/stable-club/force-recover-gas-provider";

describe("residue sweep multicall", () => {
  it("builds SwapRouter02 multicall(deadline, exactInputSingle[]) for cbBTC+WETH", () => {
    const account = getAddress("0xab4e242C5b489e8301408C93003903364214559F");
    const data = buildUniResidueSweepMulticallData({
      recipient: account,
      deadline: BigInt(1_700_000_000),
      legs: [
        {
          tokenIn: BASE_TOKENS.cbBTC.address,
          amountIn: BigInt(4504),
          minOut: BigInt(100_000),
        },
        {
          tokenIn: BASE_TOKENS.WETH.address,
          amountIn: BigInt(1_000_000_000_000_000),
          minOut: BigInt(200_000),
        },
      ],
    });
    expect(data.slice(0, 10).toLowerCase()).toBe(MULTICALL_DEADLINE_SELECTOR);
    expect(
      isRecoverSweepMulticallCall({
        to: BASE_DEX_UNISWAP_V3.swapRouter,
        data,
      }),
    ).toBe(true);
    expect(data.toLowerCase()).toContain(
      BASE_TOKENS.cbBTC.address.slice(2).toLowerCase(),
    );
    expect(data.toLowerCase()).toContain(
      BASE_TOKENS.WETH.address.slice(2).toLowerCase(),
    );
    expect(data.toLowerCase()).toContain(
      BASE_TOKENS.USDC.address.slice(2).toLowerCase(),
    );
  });

  it("max approve constant is maxUint256", () => {
    expect(RECOVER_MAX_APPROVE_AMOUNT).toBe(
      BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      ),
    );
  });
});

describe("wrapProviderForceRecoverGas", () => {
  it("forces eth_sendTransaction gas for Uni sweep multicall", async () => {
    const inner = {
      request: vi.fn(async (args: { method: string; params?: unknown }) => {
        const tx = (args.params as [{ gas: string }])[0];
        return { gas: tx.gas };
      }),
    };
    const wrapped = wrapProviderForceRecoverGas(inner);
    const sweepData = buildUniResidueSweepMulticallData({
      recipient: getAddress("0xab4e242C5b489e8301408C93003903364214559F"),
      deadline: BigInt(1_700_000_000),
      legs: [
        {
          tokenIn: BASE_TOKENS.cbBTC.address,
          amountIn: BigInt(1),
          minOut: BigInt(1),
        },
      ],
    });
    const result = (await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xab4e242C5b489e8301408C93003903364214559F",
          to: BASE_DEX_UNISWAP_V3.swapRouter,
          data: sweepData,
          gas: "0x186a0", // 100k — below floor
        },
      ],
    })) as { gas: string };
    expect(BigInt(result.gas)).toBeGreaterThanOrEqual(RECOVER_SWEEP_GAS_FLOOR);
    expect(result.gas).toBe(
      forceRecoverTxGas({ gas: "0x186a0", floor: RECOVER_SWEEP_GAS_FLOOR }),
    );
  });

  it("inflates eth_estimateGas for cbBTC approve to Uni router", async () => {
    const approveData = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ] as const,
      functionName: "approve",
      args: [BASE_DEX_UNISWAP_V3.swapRouter, RECOVER_MAX_APPROVE_AMOUNT],
    });
    const inner = {
      request: vi.fn(async (_args: { method: string; params?: unknown }) => "0xa8d0"), // 43216 warm-slot OOG
    };
    const wrapped = wrapProviderForceRecoverGas(inner);
    const result = await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: BASE_TOKENS.cbBTC.address, data: approveData }],
    });
    expect(typeof result).toBe("string");
    expect(BigInt(result as string)).toBeGreaterThan(BigInt(60_761));
  });
});
