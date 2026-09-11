import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, parseAbiParameters } from "viem";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  getSqrtRatioAtTick,
  simulateClMintConsumedAmounts,
} from "@/lib/stable-club/cl-liquidity-math";
import { formatStableClubExecutionError } from "@/lib/stable-club/execution-errors";
import {
  applyLpSlippageMin,
  computeClMintAmountMins,
  MINT_RATIO_DRIFT_TICK_SPACINGS,
} from "@/lib/stable-club/quote-plan";

describe("CL mint amount mins (PSC prevention)", () => {
  it("sizes mins from consumed amounts, not raw desired (USDC/cbBTC ratio)", () => {
    const tick = -66813;
    const tickLower = -67800;
    const tickUpper = -65800;
    const sqrtPriceX96 = getSqrtRatioAtTick(tick);
    const desiredA = BigInt(2_000_000); // USDC
    const desiredB = BigInt(2_486); // cbBTC units
    const consumed = simulateClMintConsumedAmounts({
      tokenA: BASE_TOKENS.USDC.address,
      tokenB: BASE_TOKENS.cbBTC.address,
      desiredA,
      desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96,
    });
    expect(consumed.amountA).toBeLessThan(desiredA);
    expect(consumed.amountB).toBeLessThanOrEqual(desiredB);

    const mins = computeClMintAmountMins({
      tokenA: BASE_TOKENS.USDC.address,
      tokenB: BASE_TOKENS.cbBTC.address,
      desiredA,
      desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96,
      lpSlippageBps: BigInt(100),
    });
    expect(mins.amountAMin).toBe(applyLpSlippageMin(consumed.amountA, BigInt(100)));
    expect(mins.amountAMin).toBeLessThan(applyLpSlippageMin(desiredA, BigInt(100)));
    expect(mins.amountAMin + mins.amountBMin).toBeGreaterThan(BigInt(0));
  });

  it("band mins survive tx 0x1cf401c6 plan→inclusion drift (leg1 Uni USDC/cbBTC)", () => {
    // Live fail: plan tick -66438 → exec -66442; amount1Min 2197 vs consumed 2064.
    const tickLower = -66530;
    const tickUpper = -66330;
    const planTick = -66438;
    const execTick = -66442;
    const desiredA = BigInt(2_000_000);
    const desiredB = BigInt(2576);
    const spacing = 10;
    const drift = MINT_RATIO_DRIFT_TICK_SPACINGS * spacing;

    const pointMins = computeClMintAmountMins({
      tokenA: BASE_TOKENS.USDC.address,
      tokenB: BASE_TOKENS.cbBTC.address,
      desiredA,
      desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96: getSqrtRatioAtTick(planTick),
      lpSlippageBps: BigInt(100),
      currentTick: planTick,
      ratioDriftTicks: 0,
    });
    const execConsumed = simulateClMintConsumedAmounts({
      tokenA: BASE_TOKENS.USDC.address,
      tokenB: BASE_TOKENS.cbBTC.address,
      desiredA,
      desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96: getSqrtRatioAtTick(execTick),
    });
    // Point mins reproduce the live failure: amountBMin > exec consume.
    expect(pointMins.amountBMin).toBeGreaterThan(execConsumed.amountB);

    const bandMins = computeClMintAmountMins({
      tokenA: BASE_TOKENS.USDC.address,
      tokenB: BASE_TOKENS.cbBTC.address,
      desiredA,
      desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96: getSqrtRatioAtTick(planTick),
      lpSlippageBps: BigInt(100),
      currentTick: planTick,
      ratioDriftTicks: drift,
    });
    expect(bandMins.amountBMin).toBeLessThanOrEqual(execConsumed.amountB);
    expect(bandMins.amountBMin).toBeLessThan(pointMins.amountBMin);
    expect(bandMins.amountAMin).toBeLessThanOrEqual(pointMins.amountAMin);
  });
});

describe("formatStableClubExecutionError", () => {
  it("decodes Aerodrome PSC Error(string)", () => {
    const data = encodeAbiParameters(parseAbiParameters("string"), ["PSC"]);
    const full = (`0x08c379a0${data.slice(2)}`) as `0x${string}`;
    const err = new BaseError("execution reverted", {
      cause: new ContractFunctionRevertedError({
        abi: [],
        data: full,
        functionName: "mint",
      }),
    });
    const msg = formatStableClubExecutionError(err);
    expect(msg).toMatch(/PSC/);
    expect(msg).toMatch(/price slippage/i);
  });

  it("parses PSC from plain message", () => {
    expect(formatStableClubExecutionError(new Error("Execution reverted with reason: PSC."))).toMatch(
      /PSC/,
    );
  });

  it("surfaces Permit2 AllowanceExpired via composed decoder", () => {
    const err = new BaseError("execution reverted", {
      cause: new ContractFunctionRevertedError({
        abi: [
          {
            type: "error",
            name: "AllowanceExpired",
            inputs: [{ name: "deadline", type: "uint256" }],
          },
        ],
        data: "0xd81b2f2e000000000000000000000000000000000000000000000000000000006a9b6fc1",
        functionName: "transferFrom",
      }),
    });
    const msg = formatStableClubExecutionError(err);
    expect(msg).toMatch(/AllowanceExpired/);
    expect(msg).toMatch(/Permit2/);
  });
});
