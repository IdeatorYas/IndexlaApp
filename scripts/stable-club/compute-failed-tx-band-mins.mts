/**
 * Compute band-window LP mins for the failed live deposit legs (no path aliases).
 * Prints JSON to stdout for the Hardhat fork proof.
 */
import {
  getSqrtRatioAtTick,
  simulateClMintConsumedAmountsOverTickWindow,
} from "../../src/lib/stable-club/cl-liquidity-math.ts";

const BPS = 10000n;
function applyLpSlippageMin(amount: bigint, lpSlippageBps: bigint): bigint {
  return (amount * (BPS - lpSlippageBps)) / BPS;
}

type Leg = {
  legIndex: number;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  desiredA: bigint;
  desiredB: bigint;
  currentTick: number;
  spacing: number;
};

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** Desired amounts reconstructed from failed tx 0x1cf401c6… quotedOut + retain. */
const LEGS: Leg[] = [
  {
    legIndex: 0,
    tokenA: USDC,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tickLower: -67400,
    tickUpper: -65400,
    desiredA: 2000000n,
    desiredB: 2576n,
    currentTick: -66400, // mid of range (±1000 spacings*100? width 2000 → spacing 100)
    spacing: 100,
  },
  {
    legIndex: 1,
    tokenA: USDC,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tickLower: -66530,
    tickUpper: -66330,
    desiredA: 2000000n,
    desiredB: 2576n,
    currentTick: -66438, // plan tick from investigation
    spacing: 10,
  },
  {
    legIndex: 2,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tokenB: "0x4200000000000000000000000000000000000006",
    tickLower: -264840,
    tickUpper: -264640,
    desiredA: 2576n,
    desiredB: 809494326154426n,
    currentTick: -264740,
    spacing: 10,
  },
  {
    legIndex: 3,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tokenB: "0x4200000000000000000000000000000000000006",
    tickLower: -265700,
    tickUpper: -263700,
    desiredA: 2576n,
    desiredB: 809494326154426n,
    currentTick: -264700,
    spacing: 100,
  },
  {
    legIndex: 4,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tokenB: "0x4200000000000000000000000000000000000006",
    tickLower: -264840,
    tickUpper: -264640,
    desiredA: 2576n,
    desiredB: 809494326154426n,
    currentTick: -264740,
    spacing: 10,
  },
];

const MINT_RATIO_DRIFT_TICK_SPACINGS = 1;
const lpSlippageBps = 100n;

const out = LEGS.map((leg) => {
  const drift = MINT_RATIO_DRIFT_TICK_SPACINGS * leg.spacing;
  const consumed = simulateClMintConsumedAmountsOverTickWindow({
    tokenA: leg.tokenA,
    tokenB: leg.tokenB,
    desiredA: leg.desiredA,
    desiredB: leg.desiredB,
    tickLower: leg.tickLower,
    tickUpper: leg.tickUpper,
    sqrtPriceX96: getSqrtRatioAtTick(leg.currentTick),
    currentTick: leg.currentTick,
    ratioDriftTicks: drift,
  });
  return {
    legIndex: leg.legIndex,
    amountAMin: applyLpSlippageMin(consumed.amountA, lpSlippageBps).toString(),
    amountBMin: applyLpSlippageMin(consumed.amountB, lpSlippageBps).toString(),
    consumedA: consumed.amountA.toString(),
    consumedB: consumed.amountB.toString(),
    drift,
  };
});

process.stdout.write(JSON.stringify(out));
