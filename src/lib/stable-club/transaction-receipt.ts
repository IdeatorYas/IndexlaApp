/**
 * SC-F01 — require successful transaction receipts before continuing Stable Club flows.
 * Viem `waitForTransactionReceipt` resolves on mined reverts; callers must assert status.
 */
import type { Hex } from "viem";
import {
  FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
  isOutOfGasReceipt,
  resolveOutOfGasGasLimit,
} from "@/lib/stable-club/five-pool-deposit-gas";

export type TransactionReceiptStatus = "success" | "reverted" | string;

export type TransactionReceiptLike = {
  status?: TransactionReceiptStatus | null;
  transactionHash?: Hex;
  gasUsed?: bigint | null;
};

export class TransactionRevertedError extends Error {
  readonly hash: Hex | undefined;
  readonly receiptStatus: string;

  constructor(receiptStatus: string, hash?: Hex, message?: string) {
    super(
      message ??
        (receiptStatus === "unknown" || receiptStatus === ""
          ? "Transaction receipt missing or unknown status — treating as failure"
          : `Transaction failed on-chain (receipt.status=${receiptStatus})`),
    );
    this.name = "TransactionRevertedError";
    this.hash = hash;
    this.receiptStatus = receiptStatus || "unknown";
  }
}

export function isSuccessfulTransactionReceipt(
  receipt: TransactionReceiptLike | null | undefined,
): boolean {
  return receipt?.status === "success";
}

export type AssertSuccessfulReceiptOpts = {
  /** App-requested gas limit (may differ from what the wallet mined). */
  gasLimit?: bigint;
  /** Mined transaction.gas — preferred for wallet-substituted OOG detection. */
  minedGasLimit?: bigint;
};

/**
 * Fail closed unless receipt.status is exactly "success".
 * Missing, null, undefined, "reverted", or any other value throws.
 * OOG uses mined tx gas when provided so wallet-lowered limits are detected.
 */
export function assertSuccessfulTransactionReceipt(
  receipt: TransactionReceiptLike | null | undefined,
  hash?: Hex,
  opts?: AssertSuccessfulReceiptOpts,
): asserts receipt is TransactionReceiptLike & { status: "success" } {
  if (receipt == null || receipt.status == null || receipt.status === "") {
    throw new TransactionRevertedError("unknown", hash ?? receipt?.transactionHash);
  }
  if (receipt.status !== "success") {
    const gasLimit = resolveOutOfGasGasLimit({
      minedGasLimit: opts?.minedGasLimit,
      requestedGasLimit: opts?.gasLimit,
    });
    if (
      gasLimit != null &&
      receipt.gasUsed != null &&
      isOutOfGasReceipt({
        status: receipt.status,
        gasLimit,
        gasUsed: receipt.gasUsed,
      })
    ) {
      throw new TransactionRevertedError(
        String(receipt.status),
        hash ?? receipt.transactionHash,
        FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
      );
    }
    throw new TransactionRevertedError(
      String(receipt.status),
      hash ?? receipt.transactionHash,
    );
  }
}

type PublicClientWithReceipt = {
  waitForTransactionReceipt: (args: {
    hash: Hex;
  }) => Promise<TransactionReceiptLike>;
  getTransaction?: (args: { hash: Hex }) => Promise<{ gas: bigint }>;
};

/** Wait for mining, then require success before dependent steps continue. */
export async function waitForSuccessfulTransactionReceipt(
  publicClient: PublicClientWithReceipt,
  hash: Hex,
  opts?: { gasLimit?: bigint },
): Promise<TransactionReceiptLike & { status: "success" }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  let minedGasLimit: bigint | undefined;
  if (receipt.status !== "success" && typeof publicClient.getTransaction === "function") {
    try {
      const tx = await publicClient.getTransaction({ hash });
      if (tx?.gas != null && tx.gas > BigInt(0)) {
        minedGasLimit = tx.gas;
      }
    } catch {
      /* fall back to requested gasLimit */
    }
  }
  assertSuccessfulTransactionReceipt(receipt, hash, {
    gasLimit: opts?.gasLimit,
    minedGasLimit,
  });
  return receipt as TransactionReceiptLike & { status: "success" };
}

/**
 * Execute sequential write steps, waiting for a successful receipt after each.
 * Stops immediately on the first reverted/unknown receipt (e.g. direct NPM multi-step).
 */
export async function executeSequentialSuccessfulTransactions(params: {
  steps: ReadonlyArray<() => Promise<Hex>>;
  waitForSuccess: (hash: Hex) => Promise<unknown>;
}): Promise<Hex[]> {
  const hashes: Hex[] = [];
  for (const step of params.steps) {
    const hash = await step();
    await params.waitForSuccess(hash);
    hashes.push(hash);
  }
  return hashes;
}
