import { describe, expect, it, vi } from "vitest";
import {
  DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR,
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  toHexGasQuantity,
} from "@/lib/stable-club/five-pool-deposit-gas";
import { wrapProviderForceFivePoolDepositGas } from "@/lib/stable-club/force-five-pool-deposit-gas-provider";

const DEPOSIT_DATA = `${DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR}${"00".repeat(32)}`;

describe("wrapProviderForceFivePoolDepositGas", () => {
  it("inflates eth_estimateGas for depositFivePoolStrategy to the 10M floor", async () => {
    const inner = {
      request: vi.fn(async () => "0x5eecfa"), // 6_221_050 — live OOG tx 0x5bab6b53
    };
    const wrapped = wrapProviderForceFivePoolDepositGas(inner);
    const result = await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0x488f0680ff28908F49CC85C05b9E4813e657FcD2", data: DEPOSIT_DATA }],
    });
    expect(result).toBe(toHexGasQuantity(FIVE_POOL_DEPOSIT_GAS_FLOOR));
  });

  it("forces eth_sendTransaction gas up to the floor when wallet estimate is low", async () => {
    const inner = {
      request: vi.fn(async (args: { method: string; params?: unknown }) => {
        const tx = (args.params as [{ gas: string }])[0];
        return { gas: tx.gas };
      }),
    };
    const wrapped = wrapProviderForceFivePoolDepositGas(inner);
    const result = (await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xab4e242C5b489e8301408C93003903364214559F",
          to: "0x488f0680ff28908F49CC85C05b9E4813e657FcD2",
          data: DEPOSIT_DATA,
          gas: "0x5eecfa",
        },
      ],
    })) as { gas: string };
    expect(result.gas).toBe(toHexGasQuantity(FIVE_POOL_DEPOSIT_GAS_FLOOR));
    expect(inner.request).toHaveBeenCalledWith({
      method: "eth_sendTransaction",
      params: [
        expect.objectContaining({
          gas: toHexGasQuantity(FIVE_POOL_DEPOSIT_GAS_FLOOR),
        }),
      ],
    });
  });

  it("does not alter unrelated estimateGas calls", async () => {
    const inner = {
      request: vi.fn(async () => "0x5208"),
    };
    const wrapped = wrapProviderForceFivePoolDepositGas(inner);
    const result = await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", data: "0x095ea7b3" }],
    });
    expect(result).toBe("0x5208");
  });
});
