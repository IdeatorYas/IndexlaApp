import type { Address, Hex } from "viem";
import { permissionRegistryAbi } from "@/lib/stable-club/abis";

/** PermissionRegistry accepts any unused uint256; we never submit 0. */
export const MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS = 3;

const UINT256_BYTE_LENGTH = 32;

function defaultRandomBytes(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random source unavailable for execution nonce");
  }
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * Cryptographically random non-zero uint256 candidate.
 * 32 bytes → [0, 2^256); map 0 → 1 so the candidate is always non-zero.
 */
export function generateNonZeroUint256Nonce(
  randomBytes: (length: number) => Uint8Array = defaultRandomBytes,
): bigint {
  const bytes = randomBytes(UINT256_BYTE_LENGTH);
  if (!(bytes instanceof Uint8Array) || bytes.length !== UINT256_BYTE_LENGTH) {
    throw new Error("Malformed random bytes for execution nonce");
  }
  let n = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    n = (n << BigInt(8)) | BigInt(bytes[i]!);
  }
  if (n === BigInt(0)) return BigInt(1);
  return n;
}

export type ResolvePermissionExecutionNonceOptions = {
  /** Injectable RNG for tests; defaults to crypto.getRandomValues. */
  randomBytes?: (length: number) => Uint8Array;
  maxAttempts?: number;
};

/**
 * SC-F08 O(1) — PermissionRegistry `_consumeExecutionNonce` only requires
 * `!executionNonceUsed[permissionId][executionNonce]` (any unused uint256).
 *
 * Pick a fresh random non-zero uint256, check once; on collision retry up to 3 times.
 */
export async function resolveNextPermissionExecutionNonce(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof permissionRegistryAbi;
      functionName: "executionNonceUsed";
      args: readonly [Hex, bigint];
    }) => Promise<unknown>;
  },
  permissionRegistry: Address,
  permissionId: Hex,
  options?: ResolvePermissionExecutionNonceOptions,
): Promise<bigint> {
  if (typeof permissionId !== "string" || !permissionId.startsWith("0x")) {
    throw new Error("Malformed permissionId for execution nonce read");
  }

  const maxAttempts = options?.maxAttempts ?? MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS;
  if (maxAttempts < 1 || maxAttempts > MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS) {
    throw new Error("Invalid execution nonce maxAttempts");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let candidate: bigint;
    try {
      candidate = generateNonZeroUint256Nonce(options?.randomBytes);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Permission execution nonce generation failed: ${detail}`);
    }
    if (candidate <= BigInt(0)) {
      throw new Error("Generated execution nonce must be non-zero");
    }

    let used: unknown;
    try {
      used = await publicClient.readContract({
        address: permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "executionNonceUsed",
        args: [permissionId, candidate],
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Permission execution nonce read failed: ${detail}`);
    }

    if (typeof used !== "boolean") {
      throw new Error("Malformed executionNonceUsed response");
    }
    if (!used) return candidate;
  }

  throw new Error(
    `Permission execution nonce exhausted after ${maxAttempts} collisions`,
  );
}

export type SyncSubmissionLock = {
  tryAcquire: () => boolean;
  release: () => void;
  isLocked: () => boolean;
};

/** Synchronous exclusion for wallet submissions (not React state). */
export function createSyncSubmissionLock(): SyncSubmissionLock {
  let locked = false;
  return {
    tryAcquire(): boolean {
      if (locked) return false;
      locked = true;
      return true;
    },
    release(): void {
      locked = false;
    },
    isLocked(): boolean {
      return locked;
    },
  };
}

export const SUBMISSION_IN_PROGRESS_MESSAGE =
  "Another Stable Club submission is already in progress";

/**
 * Acquire sync lock before any async work; always release in finally.
 * Second concurrent caller rejects without running `fn`.
 */
export async function runWithSyncSubmissionLock<T>(
  lock: SyncSubmissionLock,
  fn: () => Promise<T>,
): Promise<T> {
  if (!lock.tryAcquire()) {
    throw new Error(SUBMISSION_IN_PROGRESS_MESSAGE);
  }
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
