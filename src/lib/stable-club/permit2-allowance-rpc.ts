import type { ClFivePoolPermit2LiveAllowances } from "@/lib/stable-club/five-pool-permit2";
import {
  formatStableClubRpcUserError,
  isRpcRateLimitError,
} from "@/lib/stable-club/base-rpc-client";

const inflightAllowanceReads = new Map<
  string,
  Promise<ClFivePoolPermit2LiveAllowances>
>();

export function buildClFivePoolPermit2AllowanceDedupeKey(params: {
  owner: string;
  token: string;
  permit2: string;
  clExecutor: string;
}): string {
  return [
    params.owner.toLowerCase(),
    params.token.toLowerCase(),
    params.permit2.toLowerCase(),
    params.clExecutor.toLowerCase(),
  ].join("|");
}

/**
 * Share concurrent identical Permit2 allowance eth_call batches so polls don't spam RPC.
 */
export function dedupeClFivePoolPermit2AllowanceRead(
  key: string,
  factory: () => Promise<ClFivePoolPermit2LiveAllowances>,
): Promise<ClFivePoolPermit2LiveAllowances> {
  const existing = inflightAllowanceReads.get(key);
  if (existing) return existing;
  const pending = factory().finally(() => {
    if (inflightAllowanceReads.get(key) === pending) {
      inflightAllowanceReads.delete(key);
    }
  });
  inflightAllowanceReads.set(key, pending);
  return pending;
}

/** Test helper — clear in-flight map between cases. */
export function clearClFivePoolPermit2AllowanceDedupeForTests(): void {
  inflightAllowanceReads.clear();
}

export async function withStableClubRpcRetryBackoff<T>(
  fn: () => Promise<T>,
  opts?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 4;
  const baseDelayMs = opts?.baseDelayMs ?? 300;
  const sleep =
    opts?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable =
        isRpcRateLimitError(err) ||
        /failed to fetch|network|ECONNRESET|ETIMEDOUT|503|502|504|rate.?limit/i.test(
          err instanceof Error ? err.message : String(err ?? ""),
        );
      if (!retryable) {
        throw err;
      }
      if (attempt === maxAttempts - 1) {
        throw new Error(formatStableClubRpcUserError(err));
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw new Error(formatStableClubRpcUserError(lastErr));
}

/**
 * Deduped + retried Permit2 allowance batch for deposit prechecks / refresh polls.
 */
export function readClFivePoolPermit2AllowancesWithRpcGuard(params: {
  owner: string;
  token: string;
  permit2: string;
  clExecutor: string;
  readAllowances: () => Promise<ClFivePoolPermit2LiveAllowances>;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ClFivePoolPermit2LiveAllowances> {
  const key = buildClFivePoolPermit2AllowanceDedupeKey(params);
  return dedupeClFivePoolPermit2AllowanceRead(key, () =>
    withStableClubRpcRetryBackoff(params.readAllowances, {
      maxAttempts: params.maxAttempts,
      baseDelayMs: params.baseDelayMs,
      sleep: params.sleep,
    }),
  );
}
