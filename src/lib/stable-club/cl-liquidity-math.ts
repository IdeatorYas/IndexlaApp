/**
 * Minimal Uniswap V3 / Aerodrome CL liquidity math (bigint).
 * Used to size mint amountMins from amounts the pool will actually consume.
 * BigInt() used throughout — tsconfig target is ES2017 (no bigint literals).
 */
import type { Address } from "viem";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const Q96 = ONE << BigInt(96);
const Q128 = ONE << BigInt(128);
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MIN_SQRT_RATIO = BigInt(4295128739);
const MAX_SQRT_RATIO = BigInt("1461446703485210103287273052203988822378723970342");

function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === ZERO) throw new Error("mulDiv division by zero");
  return (a * b) / denominator;
}

function toUint128(x: bigint): bigint {
  if (x < ZERO || x > Q128 - ONE) throw new Error("toUint128 overflow");
  return x;
}

/** Port of Uniswap V3 TickMath.getSqrtRatioAtTick. */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`tick out of range: ${tick}`);
  }
  const absTick = tick < 0 ? -tick : tick;
  let ratio =
    (absTick & 0x1) !== 0
      ? BigInt("0xfffcb933bd6fad37aa2d162d1a594001")
      : BigInt("0x100000000000000000000000000000000");
  if ((absTick & 0x2) !== 0) {
    ratio = (ratio * BigInt("0xfff97272373d413259a46990580e213a")) >> BigInt(128);
  }
  if ((absTick & 0x4) !== 0) {
    ratio = (ratio * BigInt("0xfff2e50f5f656932ef12357cf3c7fdcc")) >> BigInt(128);
  }
  if ((absTick & 0x8) !== 0) {
    ratio = (ratio * BigInt("0xffe5caca7e10e4e61c3624eaa0941cd0")) >> BigInt(128);
  }
  if ((absTick & 0x10) !== 0) {
    ratio = (ratio * BigInt("0xffcb9843d60f6159c9db58835c926644")) >> BigInt(128);
  }
  if ((absTick & 0x20) !== 0) {
    ratio = (ratio * BigInt("0xff973b41fa98c081472e6896dfb254c0")) >> BigInt(128);
  }
  if ((absTick & 0x40) !== 0) {
    ratio = (ratio * BigInt("0xff2ea16466c96a3843ec78b326b52861")) >> BigInt(128);
  }
  if ((absTick & 0x80) !== 0) {
    ratio = (ratio * BigInt("0xfe5dee046a99a2a811c461f1969c3053")) >> BigInt(128);
  }
  if ((absTick & 0x100) !== 0) {
    ratio = (ratio * BigInt("0xfcbe86c7900a88aedcffc83b479aa3a4")) >> BigInt(128);
  }
  if ((absTick & 0x200) !== 0) {
    ratio = (ratio * BigInt("0xf987a7253ac413176f2b074cf7815e54")) >> BigInt(128);
  }
  if ((absTick & 0x400) !== 0) {
    ratio = (ratio * BigInt("0xf3392b0822b70005940c7a398e4b70f3")) >> BigInt(128);
  }
  if ((absTick & 0x800) !== 0) {
    ratio = (ratio * BigInt("0xe7159475a2c29b7443b29c7fa6e889d9")) >> BigInt(128);
  }
  if ((absTick & 0x1000) !== 0) {
    ratio = (ratio * BigInt("0xd097f3bdfd2022b8845ad8f792aa5825")) >> BigInt(128);
  }
  if ((absTick & 0x2000) !== 0) {
    ratio = (ratio * BigInt("0xa9f746462d870fdf8a65dc1f90e061e5")) >> BigInt(128);
  }
  if ((absTick & 0x4000) !== 0) {
    ratio = (ratio * BigInt("0x70d869a156d2a1b890bb3df62baf32f7")) >> BigInt(128);
  }
  if ((absTick & 0x8000) !== 0) {
    ratio = (ratio * BigInt("0x31be135f97d08fd981231505542fcfa6")) >> BigInt(128);
  }
  if ((absTick & 0x10000) !== 0) {
    ratio = (ratio * BigInt("0x9aa508b5b7a84e1c677de54f3e99bc9")) >> BigInt(128);
  }
  if ((absTick & 0x20000) !== 0) {
    ratio = (ratio * BigInt("0x5d6af8dedb81196699c329225ee604")) >> BigInt(128);
  }
  if ((absTick & 0x40000) !== 0) {
    ratio = (ratio * BigInt("0x2216e584f5fa1ea926041bedfe98")) >> BigInt(128);
  }
  if ((absTick & 0x80000) !== 0) {
    ratio = (ratio * BigInt("0x48a170391f7dc42444e8fa2")) >> BigInt(128);
  }

  if (tick > 0) ratio = ((ONE << BigInt(256)) - ONE) / ratio;

  // round up in output (Uniswap)
  const sqrtPriceX96 = ratio >> BigInt(32);
  const rounded =
    ratio % (ONE << BigInt(32)) === ZERO ? sqrtPriceX96 : sqrtPriceX96 + ONE;
  if (rounded < MIN_SQRT_RATIO || rounded > MAX_SQRT_RATIO) {
    throw new Error("sqrtPriceX96 out of bounds");
  }
  return rounded;
}

function getLiquidityForAmount0(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  amount0: bigint,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];
  const intermediate = mulDiv(a, b, Q96);
  return toUint128(mulDiv(amount0, intermediate, b - a));
}

function getLiquidityForAmount1(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  amount1: bigint,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];
  return toUint128(mulDiv(amount1, Q96, b - a));
}

export function getLiquidityForAmounts(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  amount0: bigint,
  amount1: bigint,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];

  if (sqrtRatioX96 <= a) {
    return getLiquidityForAmount0(a, b, amount0);
  }
  if (sqrtRatioX96 < b) {
    const liquidity0 = getLiquidityForAmount0(sqrtRatioX96, b, amount0);
    const liquidity1 = getLiquidityForAmount1(a, sqrtRatioX96, amount1);
    return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  }
  return getLiquidityForAmount1(a, b, amount1);
}

function getAmount0ForLiquidity(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];
  return mulDiv(liquidity << BigInt(96), b - a, b) / a;
}

function getAmount1ForLiquidity(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): bigint {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];
  return mulDiv(liquidity, b - a, Q96);
}

export function getAmountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  let a = sqrtRatioAX96;
  let b = sqrtRatioBX96;
  if (a > b) [a, b] = [b, a];

  if (sqrtRatioX96 <= a) {
    return { amount0: getAmount0ForLiquidity(a, b, liquidity), amount1: ZERO };
  }
  if (sqrtRatioX96 < b) {
    return {
      amount0: getAmount0ForLiquidity(sqrtRatioX96, b, liquidity),
      amount1: getAmount1ForLiquidity(a, sqrtRatioX96, liquidity),
    };
  }
  return { amount0: ZERO, amount1: getAmount1ForLiquidity(a, b, liquidity) };
}

export function sortTokenAmounts(params: {
  tokenA: Address;
  tokenB: Address;
  amountA: bigint;
  amountB: bigint;
}): { token0: Address; token1: Address; amount0: bigint; amount1: bigint } {
  if (params.tokenA.toLowerCase() < params.tokenB.toLowerCase()) {
    return {
      token0: params.tokenA,
      token1: params.tokenB,
      amount0: params.amountA,
      amount1: params.amountB,
    };
  }
  return {
    token0: params.tokenB,
    token1: params.tokenA,
    amount0: params.amountB,
    amount1: params.amountA,
  };
}

/**
 * Amounts the CL pool will actually pull for a mint at `sqrtPriceX96`
 * given desired tokenA/tokenB balances and the tick range.
 */
export function simulateClMintConsumedAmounts(params: {
  tokenA: Address;
  tokenB: Address;
  desiredA: bigint;
  desiredB: bigint;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
}): { amountA: bigint; amountB: bigint; amount0: bigint; amount1: bigint; liquidity: bigint } {
  if (params.desiredA < ZERO || params.desiredB < ZERO) {
    throw new Error("desired amounts must be non-negative");
  }
  if (params.desiredA === ZERO && params.desiredB === ZERO) {
    throw new Error("desired amounts must not both be zero");
  }
  if (params.sqrtPriceX96 <= ZERO) {
    throw new Error("sqrtPriceX96 must be > 0");
  }
  const sorted = sortTokenAmounts({
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    amountA: params.desiredA,
    amountB: params.desiredB,
  });
  const sqrtA = getSqrtRatioAtTick(params.tickLower);
  const sqrtB = getSqrtRatioAtTick(params.tickUpper);
  const liquidity = getLiquidityForAmounts(
    params.sqrtPriceX96,
    sqrtA,
    sqrtB,
    sorted.amount0,
    sorted.amount1,
  );
  if (liquidity === ZERO) {
    throw new Error("simulated mint liquidity is zero");
  }
  const used = getAmountsForLiquidity(params.sqrtPriceX96, sqrtA, sqrtB, liquidity);
  if (params.tokenA.toLowerCase() < params.tokenB.toLowerCase()) {
    return {
      amountA: used.amount0,
      amountB: used.amount1,
      amount0: used.amount0,
      amount1: used.amount1,
      liquidity,
    };
  }
  return {
    amountA: used.amount1,
    amountB: used.amount0,
    amount0: used.amount0,
    amount1: used.amount1,
    liquidity,
  };
}

/**
 * Worst-case consumed amounts over a tick band around the live price.
 * Used so LP amountMins survive short plan→inclusion tick drift on narrow ranges.
 * Sweep stays strictly inside (tickLower, tickUpper) so mins never collapse to zero
 * from a single-sided out-of-range simulation.
 */
export function simulateClMintConsumedAmountsOverTickWindow(params: {
  tokenA: Address;
  tokenB: Address;
  desiredA: bigint;
  desiredB: bigint;
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
  currentTick: number;
  ratioDriftTicks: number;
}): { amountA: bigint; amountB: bigint; amount0: bigint; amount1: bigint; liquidity: bigint } {
  if (!Number.isInteger(params.currentTick)) {
    throw new Error("currentTick must be an integer");
  }
  if (!Number.isFinite(params.ratioDriftTicks) || params.ratioDriftTicks < 0) {
    throw new Error("ratioDriftTicks must be a non-negative number");
  }
  const drift = Math.floor(params.ratioDriftTicks);
  const center = simulateClMintConsumedAmounts({
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    desiredA: params.desiredA,
    desiredB: params.desiredB,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    sqrtPriceX96: params.sqrtPriceX96,
  });
  if (drift === 0) {
    return center;
  }

  // Keep at least one in-range tick on each side of the bounds.
  const lo = Math.max(params.tickLower + 1, params.currentTick - drift);
  const hi = Math.min(params.tickUpper - 1, params.currentTick + drift);
  if (lo > hi) {
    return center;
  }

  let minA = center.amountA;
  let minB = center.amountB;
  let amount0 = center.amount0;
  let amount1 = center.amount1;
  let liquidity = center.liquidity;

  for (let tick = lo; tick <= hi; tick += 1) {
    const sample = simulateClMintConsumedAmounts({
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      desiredA: params.desiredA,
      desiredB: params.desiredB,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      sqrtPriceX96: getSqrtRatioAtTick(tick),
    });
    if (sample.amountA < minA) {
      minA = sample.amountA;
      amount0 = sample.amount0;
      amount1 = sample.amount1;
      liquidity = sample.liquidity;
    }
    if (sample.amountB < minB) {
      minB = sample.amountB;
      // Prefer liquidity/token0-1 from the sample that tightens B when A already set;
      // amounts0/1 are informational — mins use amountA/amountB only.
      if (sample.amountA === minA) {
        amount0 = sample.amount0;
        amount1 = sample.amount1;
        liquidity = sample.liquidity;
      }
    }
  }

  return {
    amountA: minA,
    amountB: minB,
    amount0,
    amount1,
    liquidity,
  };
}
