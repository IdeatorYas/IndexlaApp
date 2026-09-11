/**
 * Compare residual WETH after mint for naive 50/50 vs CL-range USDC splits.
 * Read-only Base RPC — no transactions.
 */
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { base } from "viem/chains";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS, BASE_TOKENS } from "../../src/lib/stable-club/official-pools.ts";
import { readPoolSlot0States } from "../../src/lib/stable-club/pool-slot0.ts";
import {
  computeTickRange,
  splitLegUsdc,
  splitLegUsdcForClRange,
  tickSpacingForPool,
  netUsdcAfterSwapFee,
} from "../../src/lib/stable-club/quote-plan.ts";
import { simulateClMintConsumedAmounts } from "../../src/lib/stable-club/cl-liquidity-math.ts";
import { TRUSTED_PHASE2A_BASE_DEPLOYMENTS } from "../../src/lib/stable-club/trusted-phase2a-base-manifest.ts";

const GROSS = BigInt(100) * BigInt(10) ** BigInt(6); // $100
const LEG = GROSS / BigInt(5);

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

const oracleAbi = parseAbi([
  "function expectedAmountOut(address,address,uint256,uint8,uint8) view returns (uint256)",
]);

async function quoteOut(tokenOut: `0x${string}`, grossUsdc: bigint, decimalsOut: number) {
  const net = netUsdcAfterSwapFee(grossUsdc);
  return client.readContract({
    address: TRUSTED_PHASE2A_BASE_DEPLOYMENTS.oracleGuard as `0x${string}`,
    abi: oracleAbi,
    functionName: "expectedAmountOut",
    args: [
      TRUSTED_PHASE2A_BASE_DEPLOYMENTS.usdc as `0x${string}`,
      tokenOut,
      net,
      6,
      decimalsOut,
    ],
  });
}

function leftoverUsd(
  leftoverWeth: bigint,
  leftoverCbbtc: bigint,
  wethPerUsdc: number,
  cbbtcPerUsdc: number,
) {
  const wethUsd = Number(formatUnits(leftoverWeth, 18)) * wethPerUsdc;
  const cbbtcUsd = Number(formatUnits(leftoverCbbtc, 8)) * cbbtcPerUsdc;
  return { wethUsd, cbbtcUsd, totalUsd: wethUsd + cbbtcUsd };
}

async function main() {
  const states = await readPoolSlot0States(client, "base", 8453);
  // Rough USD prices from oracle via 1 USDC out
  const oneUsdc = BigInt(10) ** BigInt(6);
  const wethFor1 = await quoteOut(BASE_TOKENS.WETH.address, oneUsdc / BigInt(99) * BigInt(100), 18);
  // Use direct: value of 1e18 WETH in USDC ≈ 1e6 / (weth from 1 USDC net)
  // Simpler: fetch expected WETH for $1 net and invert
  const wethFrom1UsdcNet = await client.readContract({
    address: TRUSTED_PHASE2A_BASE_DEPLOYMENTS.oracleGuard as `0x${string}`,
    abi: oracleAbi,
    functionName: "expectedAmountOut",
    args: [
      TRUSTED_PHASE2A_BASE_DEPLOYMENTS.usdc as `0x${string}`,
      BASE_TOKENS.WETH.address,
      oneUsdc,
      6,
      18,
    ],
  });
  const cbbtcFrom1UsdcNet = await client.readContract({
    address: TRUSTED_PHASE2A_BASE_DEPLOYMENTS.oracleGuard as `0x${string}`,
    abi: oracleAbi,
    functionName: "expectedAmountOut",
    args: [
      TRUSTED_PHASE2A_BASE_DEPLOYMENTS.usdc as `0x${string}`,
      BASE_TOKENS.cbBTC.address,
      oneUsdc,
      6,
      8,
    ],
  });
  const usdcPerWeth = 1 / Number(formatUnits(wethFrom1UsdcNet, 18));
  const usdcPerCbbtc = 1 / Number(formatUnits(cbbtcFrom1UsdcNet, 8));

  let oldWeth = BigInt(0);
  let newWeth = BigInt(0);
  let oldCbbtc = BigInt(0);
  let newCbbtc = BigInt(0);
  let oldUsdc = BigInt(0);
  let newUsdc = BigInt(0);

  console.log(`Deposit $${formatUnits(GROSS, 6)} — per-leg $${formatUnits(LEG, 6)}\n`);

  for (let i = 0; i < 5; i++) {
    const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS[i]!;
    const st = states[i]!;
    const spacing = tickSpacingForPool(pool);
    const { tickLower, tickUpper } = computeTickRange(st.tick, spacing);
    const dual = pool.tokenA.address.toLowerCase() !== BASE_TOKENS.USDC.address.toLowerCase();

    const naive = splitLegUsdc(LEG, dual);
    const cl = splitLegUsdcForClRange({
      legBudget: LEG,
      dualSwap: dual,
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      tickLower,
      tickUpper,
      sqrtPriceX96: st.sqrtPriceX96,
    });

    async function desiredFromSplit(split: typeof naive) {
      let desiredA = BigInt(0);
      let desiredB = BigInt(0);
      if (split.retainUsdc > BigInt(0)) {
        if (pool.tokenA.address.toLowerCase() === BASE_TOKENS.USDC.address.toLowerCase()) {
          desiredA += split.retainUsdc;
        } else {
          desiredB += split.retainUsdc;
        }
      }
      if (dual) {
        const qCb = await quoteOut(BASE_TOKENS.cbBTC.address, split.swapGrosses[0]!, 8);
        const qWe = await quoteOut(BASE_TOKENS.WETH.address, split.swapGrosses[1]!, 18);
        // tokenA=cbBTC, tokenB=WETH
        desiredA += qCb;
        desiredB += qWe;
      } else {
        const qCb = await quoteOut(BASE_TOKENS.cbBTC.address, split.swapGrosses[0]!, 8);
        desiredB += qCb;
      }
      return { desiredA, desiredB };
    }

    const dOld = await desiredFromSplit(naive);
    const dNew = await desiredFromSplit(cl);
    const cOld = simulateClMintConsumedAmounts({
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      desiredA: dOld.desiredA,
      desiredB: dOld.desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96: st.sqrtPriceX96,
    });
    const cNew = simulateClMintConsumedAmounts({
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      desiredA: dNew.desiredA,
      desiredB: dNew.desiredB,
      tickLower,
      tickUpper,
      sqrtPriceX96: st.sqrtPriceX96,
    });

    const leftOldA = dOld.desiredA - cOld.amountA;
    const leftOldB = dOld.desiredB - cOld.amountB;
    const leftNewA = dNew.desiredA - cNew.amountA;
    const leftNewB = dNew.desiredB - cNew.amountB;

    console.log(
      `${pool.id} dual=${dual} ticks=[${tickLower},${tickUpper}] spot=${st.tick}`,
    );
    if (dual) {
      console.log(
        `  split old cbBTC/WETH USDC: ${formatUnits(naive.swapGrosses[0]!, 6)} / ${formatUnits(naive.swapGrosses[1]!, 6)}`,
      );
      console.log(
        `  split new cbBTC/WETH USDC: ${formatUnits(cl.swapGrosses[0]!, 6)} / ${formatUnits(cl.swapGrosses[1]!, 6)}`,
      );
      oldCbbtc += leftOldA;
      oldWeth += leftOldB;
      newCbbtc += leftNewA;
      newWeth += leftNewB;
      console.log(
        `  leftover old: ${formatUnits(leftOldA, 8)} cbBTC + ${formatUnits(leftOldB, 18)} WETH`,
      );
      console.log(
        `  leftover new: ${formatUnits(leftNewA, 8)} cbBTC + ${formatUnits(leftNewB, 18)} WETH`,
      );
    } else {
      console.log(
        `  split old retain/swap: ${formatUnits(naive.retainUsdc, 6)} / ${formatUnits(naive.swapGrosses[0]!, 6)}`,
      );
      console.log(
        `  split new retain/swap: ${formatUnits(cl.retainUsdc, 6)} / ${formatUnits(cl.swapGrosses[0]!, 6)}`,
      );
      oldUsdc += leftOldA;
      oldCbbtc += leftOldB;
      newUsdc += leftNewA;
      newCbbtc += leftNewB;
      console.log(
        `  leftover old: ${formatUnits(leftOldA, 6)} USDC + ${formatUnits(leftOldB, 8)} cbBTC`,
      );
      console.log(
        `  leftover new: ${formatUnits(leftNewA, 6)} USDC + ${formatUnits(leftNewB, 8)} cbBTC`,
      );
    }
    console.log("");
  }

  const oldTot = leftoverUsd(oldWeth, oldCbbtc, usdcPerWeth, usdcPerCbbtc);
  const newTot = leftoverUsd(newWeth, newCbbtc, usdcPerWeth, usdcPerCbbtc);
  console.log("=== TOTAL residual (refunded to wallet after mint) ===");
  console.log(
    `BEFORE 50/50: WETH ${formatUnits(oldWeth, 18)} (~$${oldTot.wethUsd.toFixed(4)}) + cbBTC ${formatUnits(oldCbbtc, 8)} (~$${oldTot.cbbtcUsd.toFixed(4)}) + USDC ${formatUnits(oldUsdc, 6)} → ~$${((oldTot.totalUsd) + Number(formatUnits(oldUsdc, 6))).toFixed(4)}`,
  );
  console.log(
    `AFTER  CL:    WETH ${formatUnits(newWeth, 18)} (~$${newTot.wethUsd.toFixed(4)}) + cbBTC ${formatUnits(newCbbtc, 8)} (~$${newTot.cbbtcUsd.toFixed(4)}) + USDC ${formatUnits(newUsdc, 6)} → ~$${((newTot.totalUsd) + Number(formatUnits(newUsdc, 6))).toFixed(4)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
