/**
 * SC-F01 — require successful transaction receipts before continuing Stable Club flows.
 * Viem `waitForTransactionReceipt` resolves on mined reverts; callers must assert status.
 */
import type { Hex } from "viem";

export type TransactionReceiptStatus = "success" | "reverted" | string;

export type TransactionReceiptLike = {
  status?: TransactionReceiptStatus | null;
  transactionHash?: Hex;
};

export class TransactionRevertedError extends Error {
  readonly hash: Hex | undefined;
  readonly receiptStatus: string;

  constructor(receiptStatus: string, hash?: Hex) {
    super(
      receiptStatus === "unknown" || receiptStatus === ""
        ? "Transaction receipt missing or unknown status — treating as failure"
        : `Transaction failed on-chain (receipt.status=${receiptStatus})`,
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

/**
 * Fail closed unless receipt.status is exactly "success".
 * Missing, null, undefined, "reverted", or any other value throws.
 */
export function assertSuccessfulTransactionReceipt(
  receipt: TransactionReceiptLike | null | undefined,
  hash?: Hex,
): asserts receipt is TransactionReceiptLike & { status: "success" } {
  if (receipt == null || receipt.status == null || receipt.status === "") {
    throw new TransactionRevertedError("unknown", hash ?? receipt?.transactionHash);
  }
  if (receipt.status !== "success") {
    throw new TransactionRevertedError(String(receipt.status), hash ?? receipt.transactionHash);
  }
}

type PublicClientWithReceipt = {
  waitForTransactionReceipt: (args: { hash: Hex }) => Promise<TransactionReceiptLike>;
};

/** Wait for mining, then require success before dependent steps continue. */
export async function waitForSuccessfulTransactionReceipt(
  publicClient: PublicClientWithReceipt,
  hash: Hex,
): Promise<TransactionReceiptLike & { status: "success" }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assertSuccessfulTransactionReceipt(receipt, hash);
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
