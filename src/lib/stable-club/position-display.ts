/**
 * Format on-chain position holdings for the dashboard value column.
 * USDC sides are shown as $ (1:1); otherwise both token amounts (no invented prices).
 */
export function formatPositionValueDisplay(params: {
  amountA: bigint;
  amountB: bigint;
  tokenASymbol: string;
  tokenBSymbol: string;
  decimalsA: number;
  decimalsB: number;
}): string {
  const a = formatPositionTokenAmount(params.amountA, params.decimalsA, 4);
  const b = formatPositionTokenAmount(params.amountB, params.decimalsB, 6);
  const aUsdc = params.tokenASymbol.toUpperCase() === "USDC";
  const bUsdc = params.tokenBSymbol.toUpperCase() === "USDC";
  if (aUsdc && bUsdc) {
    return `$${a}`;
  }
  if (aUsdc) {
    return `$${a} + ${b} ${params.tokenBSymbol}`;
  }
  if (bUsdc) {
    return `$${b} + ${a} ${params.tokenASymbol}`;
  }
  return `${a} ${params.tokenASymbol} + ${b} ${params.tokenBSymbol}`;
}

export function formatPositionTokenAmount(
  amount: bigint,
  decimals: number,
  maxFrac = 6,
): string {
  if (amount < BigInt(0)) return "—";
  const neg = amount < BigInt(0);
  const v = neg ? -amount : amount;
  const base = BigInt(10) ** BigInt(Math.max(0, decimals));
  const whole = v / base;
  const frac = v % base;
  if (frac === BigInt(0)) return `${neg ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const clipped = fracStr.slice(0, maxFrac);
  return `${neg ? "-" : ""}${whole.toString()}.${clipped}`;
}

export function positionStatusLabel(params: {
  liquidity: bigint;
  amountA: bigint;
  amountB: bigint;
  rangeStatus: string;
}): string {
  if (
    params.liquidity <= BigInt(0) &&
    params.amountA <= BigInt(0) &&
    params.amountB <= BigInt(0)
  ) {
    return "Closed";
  }
  if (params.rangeStatus === "in-range") return "Open · in range";
  if (params.rangeStatus === "out-of-range") return "Open · out of range";
  return "Open";
}

export function allocationPercentFromBps(bps: bigint): string {
  const pct = Number(bps) / 100;
  if (!Number.isFinite(pct)) return "—";
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
}
