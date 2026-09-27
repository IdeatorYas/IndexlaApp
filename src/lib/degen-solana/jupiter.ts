import {
  DEFAULT_SLIPPAGE_BPS,
  INDEXLA_FEE_BPS,
  IMPACT_HARD,
  WSOL_MINT,
  jupiterApiBase,
  type DegenSolanaMint,
} from "@/lib/degen-solana/constants";

export type JupiterQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan?: unknown[];
  platformFee?: { amount: string; feeBps: number } | null;
  [key: string]: unknown;
};

export type JupiterSwapResponse = {
  swapTransaction: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  [key: string]: unknown;
};

function jupiterHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const key = process.env.JUPITER_API_KEY?.trim();
  if (key) headers["x-api-key"] = key;
  return headers;
}

/** Fee token accounts keyed by mint (WSOL + each basket mint). Launch gate. */
export function readFeeAccountMap(): Record<string, string> {
  const raw = process.env.DEGEN_SOLANA_FEE_ACCOUNTS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function feeAccountsConfigured(mints: readonly DegenSolanaMint[]): {
  ok: boolean;
  missing: string[];
} {
  const map = readFeeAccountMap();
  const needed = [WSOL_MINT, ...mints.map((m) => m.mint)];
  const missing = needed.filter((m) => !map[m]?.trim());
  return { ok: missing.length === 0, missing };
}

/** Cap route complexity so swap txs stay under Solana's 1232-byte packet limit. */
export const JUPITER_MAX_ACCOUNTS = 30;

export async function fetchJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint | string;
  slippageBps?: number;
  platformFeeBps?: number;
  maxAccounts?: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupiterQuoteResponse> {
  const base = jupiterApiBase().replace(/\/$/, "");
  const q = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: String(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    restrictIntermediateTokens: "true",
    maxAccounts: String(params.maxAccounts ?? JUPITER_MAX_ACCOUNTS),
  });
  if (params.onlyDirectRoutes) {
    q.set("onlyDirectRoutes", "true");
  }
  if (params.platformFeeBps != null && params.platformFeeBps > 0) {
    q.set("platformFeeBps", String(params.platformFeeBps));
  }
  const res = await fetch(`${base}/quote?${q}`, {
    headers: jupiterHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter quote ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as JupiterQuoteResponse;
}

export async function fetchJupiterSwapTx(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  feeAccount?: string;
}): Promise<JupiterSwapResponse> {
  const base = jupiterApiBase().replace(/\/$/, "");
  const body: Record<string, unknown> = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: true,
    // Force user-owned intermediate ATAs — shared_accounts_route is a common
    // Phantom "Blocked: Unsafe" trigger for multi-hop memecoin routes.
    useSharedAccounts: false,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        priorityLevel: "high",
        maxLamports: 1_000_000,
      },
    },
  };
  if (params.feeAccount) {
    body.feeAccount = params.feeAccount;
  }
  const res = await fetch(`${base}/swap`, {
    method: "POST",
    headers: {
      ...jupiterHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap ${res.status}: ${text.slice(0, 320)}`);
  }
  const json = (await res.json()) as JupiterSwapResponse;
  if (!json.swapTransaction) {
    throw new Error("Jupiter swap response missing swapTransaction");
  }
  return json;
}

export function parseImpactPct(quote: JupiterQuoteResponse): number {
  const n = Number(quote.priceImpactPct);
  return Number.isFinite(n) ? n : 0;
}

export function assertImpactAllowed(
  quote: JupiterQuoteResponse,
  opts?: { allowHard?: boolean },
): void {
  const impact = parseImpactPct(quote);
  if (impact > IMPACT_HARD && !opts?.allowHard) {
    throw new Error(
      `Price impact ${(impact * 100).toFixed(2)}% exceeds hard cap ${(IMPACT_HARD * 100).toFixed(0)}%`,
    );
  }
}

export function equalLamportSplits(
  investableLamports: bigint,
  legCount: number,
): bigint[] {
  if (legCount <= 0) return [];
  if (investableLamports <= BigInt(0)) {
    throw new Error("Investable SOL must be > 0");
  }
  const base = investableLamports / BigInt(legCount);
  const rem = investableLamports % BigInt(legCount);
  const out: bigint[] = [];
  for (let i = 0; i < legCount; i += 1) {
    out.push(base + (BigInt(i) < rem ? BigInt(1) : BigInt(0)));
  }
  return out;
}

/**
 * Split investable lamports by integer percent weights (must sum to 100).
 * Remainder lamports go to the largest weight (then first index on ties).
 */
export function weightedLamportSplits(
  investableLamports: bigint,
  weightsPct: readonly number[],
): bigint[] {
  if (weightsPct.length === 0) return [];
  if (investableLamports <= BigInt(0)) {
    throw new Error("Investable SOL must be > 0");
  }
  const rounded = weightsPct.map((w) => Math.round(Number(w)));
  const sum = rounded.reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`Allocation weights must sum to 100% (got ${sum}%)`);
  }
  if (rounded.some((w) => w < 0)) {
    throw new Error("Allocation weights must be non-negative");
  }
  const out = rounded.map((w) => (investableLamports * BigInt(w)) / BigInt(100));
  let allocated = out.reduce((a, b) => a + b, BigInt(0));
  let rem = investableLamports - allocated;
  let maxIdx = 0;
  for (let i = 1; i < rounded.length; i += 1) {
    if (rounded[i]! > rounded[maxIdx]!) maxIdx = i;
  }
  while (rem > BigInt(0)) {
    out[maxIdx] = out[maxIdx]! + BigInt(1);
    rem -= BigInt(1);
  }
  return out;
}

/** Solana packet size limit for a VersionedTransaction. */
export const SOLANA_TX_MAX_BYTES = 1232;

export function assertSwapTxSize(base64Tx: string): void {
  const binary = Buffer.from(base64Tx, "base64");
  if (binary.length > SOLANA_TX_MAX_BYTES) {
    throw new Error(
      `Swap transaction too large (${binary.length} > ${SOLANA_TX_MAX_BYTES} bytes). Try again or reduce route complexity.`,
    );
  }
}

export { INDEXLA_FEE_BPS };
