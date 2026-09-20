import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest";
import {
  applyGatewayExitGasBuffer,
  formatGatewayWithdrawWalletError,
  GATEWAY_EXIT_GAS_FLOOR,
  GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR,
  GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE,
  isGatewayExitPercentToUsdcCalldata,
  requireGatewayExitGasLimit,
  toHexGasQuantity,
} from "@/lib/stable-club/gateway-exit-gas";
import { wrapProviderForceGatewayExitGas } from "@/lib/stable-club/force-gateway-exit-gas-provider";

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

  it("maps false user-reject / simulate failures to sim guidance", () => {
    expect(
      formatGatewayWithdrawWalletError(new Error("User rejected the request")),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
    expect(
      formatGatewayWithdrawWalletError(
        new Error("Failed to simulate the results of this request."),
      ),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
    expect(
      formatGatewayWithdrawWalletError({
        shortMessage: "User rejected the request.",
        code: 4001,
      }),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
  });

  it("short-circuits eth_estimateGas without calling the wallet", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const inner = vi.fn(async () => {
      throw new Error("wallet should not be called for exit estimateGas");
    });
    const wrapped = wrapProviderForceGatewayExitGas(
      { request: inner },
      { cachedExitGas: GATEWAY_EXIT_GAS_FLOOR },
    );
    const estimate = (await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316", data }],
    })) as string;
    expect(BigInt(estimate)).toBe(GATEWAY_EXIT_GAS_FLOOR);
    expect(inner).not.toHaveBeenCalled();
  });

  it("forces gas on eth_call and wallet_sendTransaction", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const seen: Array<{ method: string; gas?: string }> = [];
    const provider = {
      request: async (args: { method: string; params?: unknown }) => {
        const tx = (args.params as [{ gas?: string }])?.[0];
        seen.push({ method: args.method, gas: tx?.gas });
        if (args.method === "eth_call") return "0x";
        if (
          args.method === "eth_sendTransaction" ||
          args.method === "wallet_sendTransaction"
        ) {
          return "0xabc";
        }
        throw new Error(`unexpected ${args.method}`);
      },
    };
    const wrapped = wrapProviderForceGatewayExitGas(provider, {
      cachedExitGas: GATEWAY_EXIT_GAS_FLOOR,
    });

    await wrapped.request({
      method: "eth_call",
      params: [{ to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316", data }],
    });
    await wrapped.request({
      method: "wallet_sendTransaction",
      params: [
        {
          to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316",
          data,
          gas: toHexGasQuantity(BigInt(400_000)),
        },
      ],
    });

    expect(BigInt(seen[0]!.gas!)).toBeGreaterThanOrEqual(GATEWAY_EXIT_GAS_FLOOR);
    expect(BigInt(seen[1]!.gas!)).toBeGreaterThanOrEqual(GATEWAY_EXIT_GAS_FLOOR);
  });
});

describe("gateway withdraw wiring", () => {
  const src = readFileSync(
    resolve(__dirname, "./ops-gateway-withdraw.ts"),
    "utf8",
  );

  it("forces gateway exit gas at EIP-1193 and passes gas on send", () => {
    expect(src).toContain("wrapProviderForceGatewayExitGas");
    expect(src).toContain("cachedExitGas");
    expect(src).toContain("applyGatewayExitGasBuffer");
    expect(src).toContain("gas: params.exitGas");
  });

  it("chunks multi-LP gateway exits for mobile/WC private-sim safety", () => {
    expect(src).toContain("preferChunkedExits");
    expect(src).toContain("runExitChunks");
    expect(src).toContain("GATEWAY_EXIT_CHUNK_LEG_THRESHOLD");
    expect(src).toContain("isGatewayWithdrawWalletRejectError");
  });

  it("remints deadline after grants and never atomicBatch-gates grants", () => {
    expect(src).toContain("Remint deadline");
    expect(src).toContain("ALWAYS grant");
    expect(src).not.toContain("!caps.atomicBatchSupported");
    expect(src).not.toContain("tryWalletSendCalls");
  });
});
