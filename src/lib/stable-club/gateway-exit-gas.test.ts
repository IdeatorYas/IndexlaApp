import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  applyGatewayExitGasBuffer,
  GATEWAY_EXIT_GAS_FLOOR,
  GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR,
  isGatewayExitPercentToUsdcCalldata,
  requireGatewayExitGasLimit,
} from "@/lib/stable-club/gateway-exit-gas";
import { wrapProviderForceGatewayExitGas } from "@/lib/stable-club/force-gateway-exit-gas-provider";
import { toHexGasQuantity } from "@/lib/stable-club/gateway-exit-gas";

describe("gateway exit gas policy", () => {
  it("pins exitPercentToUsdc selector 0x4a41f906", () => {
    expect(GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR).toBe("0x4a41f906");
    expect(
      isGatewayExitPercentToUsdcCalldata(`${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}abcd`),
    ).toBe(true);
    expect(isGatewayExitPercentToUsdcCalldata("0x7d02458b")).toBe(false);
  });

  it("floors buffered estimates at 10M", () => {
    expect(applyGatewayExitGasBuffer(BigInt(1_000_000))).toBe(
      GATEWAY_EXIT_GAS_FLOOR,
    );
    expect(requireGatewayExitGasLimit(GATEWAY_EXIT_GAS_FLOOR)).toBe(
      GATEWAY_EXIT_GAS_FLOOR,
    );
  });

  it("inflates eth_estimateGas and forces eth_sendTransaction gas", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const provider = {
      request: async (args: { method: string; params?: unknown }) => {
        if (args.method === "eth_estimateGas") {
          return toHexGasQuantity(BigInt(500_000));
        }
        if (args.method === "eth_sendTransaction") {
          const tx = (args.params as [{ gas: string }])[0];
          return tx.gas;
        }
        throw new Error(`unexpected ${args.method}`);
      },
    };
    const wrapped = wrapProviderForceGatewayExitGas(provider);
    const estimate = (await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316", data }],
    })) as string;
    expect(BigInt(estimate)).toBeGreaterThanOrEqual(GATEWAY_EXIT_GAS_FLOOR);

    const forced = (await wrapped.request({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316",
          data,
          gas: toHexGasQuantity(BigInt(400_000)),
        },
      ],
    })) as string;
    expect(BigInt(forced)).toBeGreaterThanOrEqual(GATEWAY_EXIT_GAS_FLOOR);
  });
});

describe("gateway withdraw wiring", () => {
  const src = readFileSync(
    resolve(__dirname, "./ops-gateway-withdraw.ts"),
    "utf8",
  );

  it("forces gateway exit gas at EIP-1193 and passes gas on send", () => {
    expect(src).toContain("wrapProviderForceGatewayExitGas");
    expect(src).toContain("applyGatewayExitGasBuffer");
    expect(src).toContain("requireGatewayExitGasLimit");
    expect(src).toContain("gas: params.exitGas");
    expect(src).toContain("exitGas,");
    expect(src).toContain("estimateGas");
  });

  it("always grants before exit sim (never atomicBatch-gated)", () => {
    expect(src).toContain("ALWAYS grant");
    expect(src).not.toContain("!caps.atomicBatchSupported");
    expect(src).not.toContain("tryWalletSendCalls");
  });
});
