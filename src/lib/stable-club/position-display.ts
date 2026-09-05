/**
 * Format Stable Club position token amounts for product UI (on-chain units only).
 */
export function formatPositionTokenAmount(
  amount: bigint,
  decimals: number,
  maxFrac = 6,
): string {
  if (amount < BigInt(0)) return "—";
  const neg = amount < BigInt(0);
  const v = neg ? -amount : amount;
  const base = BigInt(10) ** BigInt(decimals);
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
