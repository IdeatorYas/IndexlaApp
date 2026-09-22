import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest";
import {
  applyGatewayExitGasBuffer,
  clampGatewayExitGasToAffordability,
  formatGatewayWithdrawWalletError,
  GATEWAY_EXIT_CHUNK_GAS_FLOOR,
  GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI,
  GATEWAY_EXIT_GAS_ABSOLUTE_MIN,
  GATEWAY_EXIT_GAS_FLOOR,
  GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR,
  GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI,
  GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE,
  isGatewayExitPercentToUsdcCalldata,
  requireGatewayExitGasLimit,
  resolveGatewayExitGas,
  resolveWalletVisibleGatewayExitMaxFee,
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

  it("buffers estimate without 10M / 1.5M floors", () => {
    expect(applyGatewayExitGasBuffer(BigInt(517_541))).toBe(
      (BigInt(517_541) * BigInt(14_000)) / BigInt(10_000),
    );
    expect(requireGatewayExitGasLimit(BigInt(700_000))).toBe(BigInt(700_000));
    expect(GATEWAY_EXIT_GAS_FLOOR).toBe(BigInt(10_000_000));
    expect(GATEWAY_EXIT_CHUNK_GAS_FLOOR).toBe(BigInt(1_500_000));
  });

  it("uses live network×pad fee (no fixed 5 gwei floor) for low-ETH friend case", () => {
    const eth = BigInt("1751000000000000"); // ~0.001751
    const estimate = BigInt(518_000);
    const networkMaxFee = BigInt(7_000_000); // 0.007 gwei
    const gas = resolveGatewayExitGas({
      estimateGas: estimate,
      ethBalance: eth,
      networkMaxFee,
    });
    expect(gas).toBe((estimate * BigInt(14_000)) / BigInt(10_000));
    // Live pad ≪ 5 gwei → reserve fits; legacy 5 gwei floor would not.
    const livePad = networkMaxFee * BigInt(12);
    expect(gas * livePad).toBeLessThan(eth);
    expect(
      gas * GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI > eth,
    ).toBe(true);
  });

  it("pins wallet-visible maxFee at 1 gwei floor for dust Base fees", () => {
    const eth = BigInt("1751000000000000"); // ~0.001751
    const exitGas = BigInt(729_617);
    const networkMaxFee = BigInt(7_000_000); // 0.007 gwei
    const maxFee = resolveWalletVisibleGatewayExitMaxFee({
      exitGas,
      ethBalance: eth,
      networkMaxFee,
    });
    expect(maxFee).toBe(GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI);
    expect(exitGas * maxFee).toBeLessThan(eth);
    // Raw live pin would be dust; 5 gwei pad would exceed ETH.
    expect(networkMaxFee).toBeLessThan(GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI);
    expect(exitGas * GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI > eth).toBe(true);
  });

  it("throws when ETH cannot cover 1 gwei wallet fee floor", () => {
    expect(() =>
      resolveWalletVisibleGatewayExitMaxFee({
        exitGas: BigInt(2_000_000),
        ethBalance: BigInt("500000000000000"), // 0.0005 ETH
        networkMaxFee: BigInt(7_000_000),
      }),
    ).toThrow(/wallet fee reserve/);
  });

  it("throws when raw estimate exceeds ETH budget at live padded fee", () => {
    expect(() =>
      clampGatewayExitGasToAffordability({
        gas: BigInt(2_000_000),
        rawEstimate: BigInt(2_000_000),
        ethBalance: BigInt("1000000000000"), // 0.000001 ETH
        networkMaxFee: BigInt(1_000_000_000), // 1 gwei → pad 12 gwei
      }),
    ).toThrow(/Not enough Base ETH/);
  });

  it("maps false user-reject / simulate failures to sim guidance", () => {
    expect(
      formatGatewayWithdrawWalletError(
        new Error("Failed to simulate the results of this request."),
      ),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
    expect(
      formatGatewayWithdrawWalletError({
        shortMessage: "User rejected the request.",
        cause: new Error("Failed to simulate the results of this request."),
      }),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
    // Genuine cancel / 4001 must NOT be remapped when reserve fits.
    expect(
      formatGatewayWithdrawWalletError(new Error("User rejected the request")),
    ).toBeNull();
    expect(
      formatGatewayWithdrawWalletError(
        { shortMessage: "User rejected the request.", code: 4001 },
        {
          submittedGas: BigInt(729_715),
          ethBalance: BigInt("1751000000000000"),
          networkMaxFee: BigInt(7_000_000),
        },
      ),
    ).toBeNull();
    // Same reject with inflated legacy-style fee context → sim guidance.
    expect(
      formatGatewayWithdrawWalletError(
        { shortMessage: "User rejected the request.", code: 4001 },
        {
          submittedGas: BigInt(729_715),
          ethBalance: BigInt("1751000000000000"),
          networkMaxFee: BigInt(5_000_000_000),
        },
      ),
    ).toBe(GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE);
  });

  it("short-circuits eth_estimateGas without calling the wallet", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const inner = vi.fn(async () => {
      throw new Error("wallet should not be called for exit estimateGas");
    });
    const cached = BigInt(724_557);
    const wrapped = wrapProviderForceGatewayExitGas(
      { request: inner },
      { cachedExitGas: cached },
    );
    const estimate = (await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316", data }],
    })) as string;
    expect(BigInt(estimate)).toBe(cached);
    expect(inner).not.toHaveBeenCalled();
  });

  it("forces cached gas on eth_call and wallet_sendTransaction", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const seen: Array<{
      method: string;
      gas?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      value?: string;
    }> = [];
    const cached = BigInt(724_557);
    const maxFee = BigInt(7_000_000);
    const tip = BigInt(1_000_000);
    const provider = {
      request: async (args: { method: string; params?: unknown }) => {
        const tx = (
          args.params as [
            {
              gas?: string;
              maxFeePerGas?: string;
              maxPriorityFeePerGas?: string;
              value?: string;
            },
          ]
        )?.[0];
        seen.push({
          method: args.method,
          gas: tx?.gas,
          maxFeePerGas: tx?.maxFeePerGas,
          maxPriorityFeePerGas: tx?.maxPriorityFeePerGas,
          value: tx?.value,
        });
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
      cachedExitGas: cached,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: tip,
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

    expect(BigInt(seen[0]!.gas!)).toBe(cached);
    expect(BigInt(seen[1]!.gas!)).toBe(cached);
    expect(BigInt(seen[1]!.maxFeePerGas!)).toBe(maxFee);
    expect(BigInt(seen[1]!.maxPriorityFeePerGas!)).toBe(tip);
    expect(seen[1]!.value).toBe("0x0");
  });

  it("defaults eth_estimateGas to absolute min when cache missing", async () => {
    const data = `${GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR}${"00".repeat(32)}`;
    const wrapped = wrapProviderForceGatewayExitGas({
      request: async () => {
        throw new Error("should short-circuit");
      },
    });
    const estimate = (await wrapped.request({
      method: "eth_estimateGas",
      params: [{ to: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316", data }],
    })) as string;
    expect(BigInt(estimate)).toBe(GATEWAY_EXIT_GAS_ABSOLUTE_MIN);
  });
});

describe("gateway withdraw wiring", () => {
  const src = readFileSync(
    resolve(__dirname, "./ops-gateway-withdraw.ts"),
    "utf8",
  );

  it("forces gateway exit gas at EIP-1193 and passes gas + live EIP-1559 fees on send", () => {
    expect(src).toContain("wrapProviderForceGatewayExitGas");
    expect(src).toContain("cachedExitGas");
    expect(src).toContain("resolveGatewayExitGas");
    expect(src).toContain("resolveWalletVisibleGatewayExitMaxFee");
    expect(src).toContain("gas: params.exitGas");
    expect(src).toContain("maxFeePerGas");
    expect(src).toContain("maxPriorityFeePerGas");
    expect(src).toContain("value: BigInt(0)");
    expect(src).toContain("isGatewayExitWalletPrivateFeeUnaffordable");
  });

  it("prefers oneshot on desktop; mobile preferChunkedExits skips oneshot", () => {
    expect(src).toContain("allowChunkFallback = true");
    expect(src).toContain("runExitChunks");
    expect(src).toContain("preferChunksFirst");
    expect(src).toContain("let useChunks = preferChunksFirst");
    expect(src).toContain("skipping multi-LP oneshot");
    expect(src).toContain("amount0Min: BigInt(0)");
    expect(src).toContain("amount1Min: BigInt(0)");
    expect(src).not.toContain("GATEWAY_EXIT_CHUNK_LEG_THRESHOLD");
    expect(src).not.toContain("GATEWAY_EXIT_AUTO_REJECT_MS");
    expect(src).not.toContain("keep gas ≥ 10,000,000");
    expect(src).not.toContain("allowChunkFallback = Boolean(params.preferChunkedExits)");
  });

  it("remints deadline after grants and never atomicBatch-gates grants", () => {
    expect(src).toContain("Remint deadline");
    expect(src).toContain("ALWAYS grant");
    expect(src).not.toContain("!caps.atomicBatchSupported");
    expect(src).not.toContain("tryWalletSendCalls");
  });
});
