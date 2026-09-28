/**
 * Degen Club Solana Memecoin Index — pinned mints + execution constants.
 * Direct ATA ownership; Jupiter-routed; ≤4 wallet confirms.
 */

export const DEGEN_SOLANA_PRODUCT_ID = "solana-memecoin-index" as const;

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const INDEXLA_FEE_BPS = 100; // 1% — per successful Jupiter leg only (production)

/** Demo/test: force 0% when DEGEN_SOLANA_FEE_BPS=0 or unset fee accounts. */
export function resolvePlatformFeeBps(): number {
  const raw = process.env.DEGEN_SOLANA_FEE_BPS?.trim();
  if (raw === "0") return 0;
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1000) return n;
  }
  return INDEXLA_FEE_BPS;
}

export const DEFAULT_SLIPPAGE_BPS = 300;
export const MAX_SLIPPAGE_BPS = 1000;
export const MIN_SLIPPAGE_BPS = 50;

/** Soft warn / hard block price impact (fraction, not bps). */
export const IMPACT_SOFT = 0.03;
export const IMPACT_HARD = 0.08;

/** Wallet popup budget for packed swap transactions (connect not counted). */
export const BUY_CONFIRM_MAX = 4;
export const SELL_CONFIRM_MAX = 4;
/** Target: up to four packed VersionedTransactions (one Phantom prompt each). */
export const SIGN_BATCH_MAX = 4;

/** Approximate rent-exempt minimum per new ATA (lamports). */
export const ATA_RENT_LAMPORTS = BigInt(2_039_280);
/**
 * Priority/network fee headroom across a 10-leg pack.
 * Kept modest so a ~0.05–0.08 SOL demo buy still leaves investable notional.
 */
export const PRIORITY_FEE_RESERVE_LAMPORTS = BigInt(15_000_000); // 0.015 SOL

export type DegenSolanaMintKey =
  | "pengu"
  | "wif"
  | "bonk"
  | "fartcoin"
  | "popcat"
  | "useless"
  | "troll"
  | "pnut"
  | "moodeng"
  | "giga";

export type DegenSolanaMint = {
  key: DegenSolanaMintKey;
  ticker: string;
  mint: string;
  decimals: number;
};

/** Exact user-specified basket — do not substitute. */
export const DEGEN_SOLANA_BASKET: readonly DegenSolanaMint[] = [
  {
    key: "pengu",
    ticker: "PENGU",
    mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
    decimals: 6,
  },
  {
    key: "wif",
    ticker: "WIF",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    decimals: 6,
  },
  {
    key: "bonk",
    ticker: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    decimals: 5,
  },
  {
    key: "fartcoin",
    ticker: "FARTCOIN",
    mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    decimals: 6,
  },
  {
    key: "popcat",
    ticker: "POPCAT",
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    decimals: 9,
  },
  {
    key: "useless",
    ticker: "USELESS",
    mint: "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk",
    decimals: 6,
  },
  {
    key: "troll",
    ticker: "TROLL",
    mint: "5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2",
    decimals: 6,
  },
  {
    key: "pnut",
    ticker: "PNUT",
    mint: "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump",
    decimals: 6,
  },
  {
    key: "moodeng",
    ticker: "MOODENG",
    mint: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY",
    decimals: 6,
  },
  {
    key: "giga",
    ticker: "GIGA",
    mint: "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",
    decimals: 5,
  },
] as const;

export const DEGEN_SOLANA_MINT_BY_KEY: Record<
  DegenSolanaMintKey,
  DegenSolanaMint
> = Object.fromEntries(
  DEGEN_SOLANA_BASKET.map((m) => [m.key, m]),
) as Record<DegenSolanaMintKey, DegenSolanaMint>;

export const ALLOWED_MINT_SET = new Set(
  DEGEN_SOLANA_BASKET.map((m) => m.mint),
);

export function isDegenSolanaLiveEnabled(): boolean {
  const v =
    process.env.NEXT_PUBLIC_DEGEN_SOLANA_LIVE?.trim() ??
    process.env.DEGEN_SOLANA_LIVE?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export function jupiterApiBase(): string {
  return (
    process.env.JUPITER_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_JUPITER_API_BASE?.trim() ||
    "https://lite-api.jup.ag/swap/v1"
  );
}

export function solanaRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.mainnet-beta.solana.com"
  );
}

/**
 * Split one-tx-per-leg items into ≤ maxPrompts signAll batches.
 * Prefer a single batch (one Phantom prompt for all legs) so blockhashes
 * stay fresh — sequential confirm-between-prompts was the 4/10 root cause.
 */
export function splitLegsIntoSignBatches<T>(
  legs: T[],
  maxPrompts = SIGN_BATCH_MAX,
): T[][] {
  if (legs.length === 0) return [];
  if (maxPrompts <= 1 || legs.length <= 12) {
    return [legs];
  }
  const batches: T[][] = [];
  const n = legs.length;
  const sizes: number[] = [];
  let remaining = n;
  while (remaining > 0 && sizes.length < maxPrompts) {
    const leftPrompts = maxPrompts - sizes.length;
    const take = Math.ceil(remaining / leftPrompts);
    sizes.push(take);
    remaining -= take;
  }
  let offset = 0;
  for (const size of sizes) {
    batches.push(legs.slice(offset, offset + size));
    offset += size;
  }
  return batches.filter((b) => b.length > 0);
}
