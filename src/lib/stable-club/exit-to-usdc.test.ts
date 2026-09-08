import { describe, expect, it } from "vitest";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  aggregateExitProceeds,
  applySlippageMin,
  buildExitToUsdcPreview,
  isExitAllToUsdcAvailable,
  isExitPercentToUsdcAvailable,
  padExitUnwindSwaps,
} from "@/lib/stable-club/exit-to-usdc";

describe("exit-to-usdc", () => {
  it("aggregates USDC/cbBTC/WETH proceeds (never WBTC label)", () => {
    const agg = aggregateExitProceeds([
      {
        tokenA: BASE_TOKENS.USDC.address,
        tokenB: BASE_TOKENS.cbBTC.address,
        tokenASymbol: "USDC",
        tokenBSymbol: "cbBTC",
        amountA: 2_000_000n,
        amountB: 2_347n,
      },
      {
        tokenA: BASE_TOKENS.cbBTC.address,
        tokenB: BASE_TOKENS.WETH.address,
        tokenASymbol: "cbBTC",
        tokenBSymbol: "WETH",
        amountA: 3_000n,
        amountB: 1_000_000_000_000_000n,
      },
    ]);
    expect(agg.usdc).toBe(2_000_000n);
    expect(agg.cbBtc).toBe(5_347n);
    expect(agg.weth).toBe(1_000_000_000_000_000n);
  });

  it("builds USDC-only preview with minOut slippage", () => {
    const preview = buildExitToUsdcPreview({
      positions: [
        {
          tokenA: BASE_TOKENS.USDC.address,
          tokenB: BASE_TOKENS.cbBTC.address,
          tokenASymbol: "USDC",
          tokenBSymbol: "cbBTC",
          amountA: 4_000_000n,
          amountB: 10_000n,
        },
        {
          tokenA: BASE_TOKENS.cbBTC.address,
          tokenB: BASE_TOKENS.WETH.address,
          tokenASymbol: "cbBTC",
          tokenBSymbol: "WETH",
          amountA: 0n,
          amountB: 1_000_000_000_000_000n,
        },
      ],
      quoteTokenToUsdc: (tokenIn, amountIn) => {
        if (tokenIn.toLowerCase() === BASE_TOKENS.cbBTC.address.toLowerCase()) {
          return amountIn * 100n; // mock
        }
        return amountIn / 10n ** 12n; // mock WETH→USDC 6dp-ish
      },
      deadline: 1_700_000_000n,
      depositedUsdc: 20_000_000n,
    });

    expect(preview.retainedUsdc).toBe(4_000_000n);
    expect(preview.nonUsdcSymbols).toEqual(["cbBTC", "WETH"]);
    expect(preview.unwindSwaps).toHaveLength(2);
    expect(preview.unwindSwaps[0]!.tokenInSymbol).toBe("cbBTC");
    expect(preview.minUsdcOut).toBeLessThanOrEqual(preview.estimatedUsdcOut);
    expect(applySlippageMin(10_000n)).toBe(9_900n);
    expect(padExitUnwindSwaps(preview.unwindSwaps)).toHaveLength(8);
  });

  it("gates Base until features.exitAllToUsdc is explicitly enabled", () => {
    expect(isExitAllToUsdcAvailable({ network: "base" })).toBe(false);
    expect(
      isExitAllToUsdcAvailable({ network: "base", features: { exitAllToUsdc: true } }),
    ).toBe(true);
    expect(isExitAllToUsdcAvailable({ network: "hardhat-local" })).toBe(true);
  });

  it("gates partial % until features.exitPercentToUsdc is explicitly enabled", () => {
    expect(isExitPercentToUsdcAvailable({ network: "base" })).toBe(false);
    expect(
      isExitPercentToUsdcAvailable({
        network: "base",
        features: { exitAllToUsdc: true },
      }),
    ).toBe(false);
    expect(
      isExitPercentToUsdcAvailable({
        network: "base",
        features: { exitAllToUsdc: true, exitPercentToUsdc: true },
      }),
    ).toBe(true);
    expect(
      isExitPercentToUsdcAvailable({
        network: "base",
        features: { exitAllToUsdc: false, exitPercentToUsdc: true },
      }),
    ).toBe(false);
  });
});

/**
 * Regression fixture from live Base exitAll tx
 * 0x5a563e4e72b9bd67515a3234849e4aa52573ba0700c79ca5e89e425b56ae7472
 */
describe("live exitAll regression (underlying tokens)", () => {
  it("documents mixed-asset return totals from the user withdrawal", () => {
    // Aggregated Transfer logs to wallet from exitAll (not USDC-only).
    const returned = {
      USDC: "4.098607",
      cbBTC: "0.00014739",
      WETH: "0.001408676265835525",
    };
    expect(Object.keys(returned).sort()).toEqual(["USDC", "WETH", "cbBTC"].sort());
    expect(returned.cbBTC).not.toMatch(/WBTC/i);
  });
});
