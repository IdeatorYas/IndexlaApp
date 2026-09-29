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

async function jupiterFetch(
  url: string,
  init?: RequestInit,
  label = "Jupiter",
): Promise<Response> {
  let lastText = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (res.status !== 429 && res.status !== 503) return res;
    lastText = await res.text();
    const ra = res.headers.get("retry-after");
    const wait = ra && /^\d+$/.test(ra)
      ? Math.min(20_000, Number(ra) * 1000)
      : Math.min(12_000, 500 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`${label} rate-limited: ${lastText.slice(0, 200)}`);
}

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
  const res = await jupiterFetch(
    `${base}/quote?${q}`,
    { headers: jupiterHeaders() },
    "Jupiter quote",
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter quote ${res.status}: ${body.slice(0, 240)}`);
  }
  return (await res.json()) as JupiterQuoteResponse;
}

export type JupiterInstruction = {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string;
};

export type JupiterSwapInstructionsResponse = {
  computeBudgetInstructions?: JupiterInstruction[];
  setupInstructions?: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  addressLookupTableAddresses?: string[];
  otherInstructions?: JupiterInstruction[];
  error?: string;
};

function jupiterSwapRequestBody(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  feeAccount?: string;
  wrapAndUnwrapSol?: boolean;
  /** Pin buy output to the user's ATA (direct ownership). */
  destinationTokenAccount?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    // Keep intermediate accounts user-owned — shared_accounts_route has
    // triggered Phantom Unsafe on memecoin routes in this product.
    // Destination ATA is still the user's (derived from userPublicKey).
    useSharedAccounts: false,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        priorityLevel: "high",
        maxLamports: 500_000,
      },
    },
  };
  if (params.feeAccount) {
    body.feeAccount = params.feeAccount;
  }
  if (params.destinationTokenAccount) {
    body.destinationTokenAccount = params.destinationTokenAccount;
  }
  return body;
}

export async function fetchJupiterSwapTx(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  feeAccount?: string;
  destinationTokenAccount?: string;
}): Promise<JupiterSwapResponse> {
  const base = jupiterApiBase().replace(/\/$/, "");
  const res = await jupiterFetch(`${base}/swap`, {
    method: "POST",
    headers: {
      ...jupiterHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jupiterSwapRequestBody(params)),
  }, "Jupiter swap");
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

export async function fetchJupiterSwapInstructions(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  feeAccount?: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<JupiterSwapInstructionsResponse> {
  const base = jupiterApiBase().replace(/\/$/, "");
  const res = await jupiterFetch(`${base}/swap-instructions`, {
    method: "POST",
    headers: {
      ...jupiterHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jupiterSwapRequestBody(params)),
  }, "Jupiter swap-instructions");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Jupiter swap-instructions ${res.status}: ${text.slice(0, 320)}`,
    );
  }
  const json = (await res.json()) as JupiterSwapInstructionsResponse;
  if (!json.swapInstruction) {
    throw new Error(
      json.error ?? "Jupiter swap-instructions missing swapInstruction",
    );
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
