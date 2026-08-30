import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  createSyncSubmissionLock,
  generateNonZeroUint256Nonce,
  MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS,
  resolveNextPermissionExecutionNonce,
  runWithSyncSubmissionLock,
  SUBMISSION_IN_PROGRESS_MESSAGE,
} from "@/lib/stable-club/permission-execution-nonce";

const REGISTRY = "0x00000000000000000000000000000000000000A1" as Address;
const PERMISSION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

function bytesFromBigInt(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & BigInt(0xff));
    x >>= BigInt(8);
  }
  return out;
}

describe("SC-F08 O(1) — random permission execution nonce", () => {
  it("one unused random candidate requires one RPC read", async () => {
    const candidate = BigInt("0xabc123");
    const randomBytes = vi.fn(() => bytesFromBigInt(candidate));
    const publicClient = {
      readContract: vi.fn(async () => false),
    };

    const next = await resolveNextPermissionExecutionNonce(
      publicClient,
      REGISTRY,
      PERMISSION_ID,
      { randomBytes },
    );

    expect(next).toBe(candidate);
    expect(publicClient.readContract).toHaveBeenCalledTimes(1);
    expect(publicClient.readContract.mock.calls[0]![0].args[1]).toBe(candidate);
  });

  it("used candidate regenerates and retries", async () => {
    const first = BigInt(111);
    const second = BigInt(222);
    let gen = 0;
    const randomBytes = vi.fn(() => {
      gen += 1;
      return bytesFromBigInt(gen === 1 ? first : second);
    });
    const publicClient = {
      readContract: vi.fn(async (args: { args: readonly [Hex, bigint] }) => {
        return args.args[1] === first;
      }),
    };

    const next = await resolveNextPermissionExecutionNonce(
      publicClient,
      REGISTRY,
      PERMISSION_ID,
      { randomBytes },
    );

    expect(next).toBe(second);
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
    expect(randomBytes).toHaveBeenCalledTimes(2);
  });

  it("maximum 3 attempts then fails closed", async () => {
    const randomBytes = vi.fn(() => bytesFromBigInt(BigInt(7)));
    const publicClient = {
      readContract: vi.fn(async () => true),
    };

    await expect(
      resolveNextPermissionExecutionNonce(publicClient, REGISTRY, PERMISSION_ID, {
        randomBytes,
      }),
    ).rejects.toThrow(/exhausted after 3 collisions/);

    expect(publicClient.readContract).toHaveBeenCalledTimes(
      MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS,
    );
    expect(randomBytes).toHaveBeenCalledTimes(MAX_PERMISSION_EXECUTION_NONCE_ATTEMPTS);
  });

  it("candidate is non-zero and valid uint256", () => {
    const zeroMapped = generateNonZeroUint256Nonce(() => bytesFromBigInt(BigInt(0)));
    expect(zeroMapped).toBe(BigInt(1));

    const max = generateNonZeroUint256Nonce(() => bytesFromBigInt(UINT256_MAX));
    expect(max).toBe(UINT256_MAX);
    expect(max > BigInt(0)).toBe(true);
    expect(max <= UINT256_MAX).toBe(true);

    const mid = generateNonZeroUint256Nonce(() => bytesFromBigInt(BigInt(42)));
    expect(mid).toBe(BigInt(42));
  });

  it("RPC nonce-read failure causes no wallet submission", async () => {
    const writeContract = vi.fn(async () => "0xhash" as Hex);
    const publicClient = {
      readContract: vi.fn(async () => {
        throw new Error("RPC timeout");
      }),
    };
    const lock = createSyncSubmissionLock();
    await expect(
      runWithSyncSubmissionLock(lock, async () => {
        const nonce = await resolveNextPermissionExecutionNonce(
          publicClient,
          REGISTRY,
          PERMISSION_ID,
          { randomBytes: () => bytesFromBigInt(BigInt(9)) },
        );
        return writeContract(nonce);
      }),
    ).rejects.toThrow(/Permission execution nonce read failed/);
    expect(writeContract).not.toHaveBeenCalled();
    expect(lock.isLocked()).toBe(false);
  });
});

describe("SC-F08 — synchronous submission lock", () => {
  it("two immediate calls produce only one nonce read and one writeContract", async () => {
    const lock = createSyncSubmissionLock();
    let nonceReads = 0;
    let writes = 0;
    let releaseGate!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let entered!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });

    const first = runWithSyncSubmissionLock(lock, async () => {
      nonceReads += 1;
      entered();
      await hold;
      writes += 1;
      return "ok";
    });

    await firstEntered;
    await expect(
      runWithSyncSubmissionLock(lock, async () => {
        nonceReads += 1;
        writes += 1;
        return "nope";
      }),
    ).rejects.toThrow(SUBMISSION_IN_PROGRESS_MESSAGE);

    releaseGate();
    await expect(first).resolves.toBe("ok");
    expect(nonceReads).toBe(1);
    expect(writes).toBe(1);
    expect(lock.isLocked()).toBe(false);
  });

  it("reverted receipt releases the lock", async () => {
    const lock = createSyncSubmissionLock();
    await expect(
      runWithSyncSubmissionLock(lock, async () => {
        throw new Error("Transaction reverted on-chain (status=0)");
      }),
    ).rejects.toThrow(/reverted/);
    expect(lock.isLocked()).toBe(false);
  });

  it("rejected signature releases the lock", async () => {
    const lock = createSyncSubmissionLock();
    await expect(
      runWithSyncSubmissionLock(lock, async () => {
        throw new Error("User rejected the request");
      }),
    ).rejects.toThrow(/rejected/);
    expect(lock.isLocked()).toBe(false);
  });

  it("a later valid retry succeeds after lock release", async () => {
    const lock = createSyncSubmissionLock();
    const publicClient = {
      readContract: vi.fn(async () => false),
    };
    const writeContract = vi.fn(async (_nonce: bigint) => "0xabc" as Hex);

    await expect(
      runWithSyncSubmissionLock(lock, async () => {
        await resolveNextPermissionExecutionNonce(publicClient, REGISTRY, PERMISSION_ID, {
          randomBytes: () => bytesFromBigInt(BigInt(3)),
        });
        throw new Error("User rejected the request");
      }),
    ).rejects.toThrow(/rejected/);

    const hash = await runWithSyncSubmissionLock(lock, async () => {
      const nonce = await resolveNextPermissionExecutionNonce(
        publicClient,
        REGISTRY,
        PERMISSION_ID,
        { randomBytes: () => bytesFromBigInt(BigInt(5)) },
      );
      return writeContract(nonce);
    });
    expect(hash).toBe("0xabc");
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract).toHaveBeenCalledWith(BigInt(5));
    expect(lock.isLocked()).toBe(false);
  });
});
