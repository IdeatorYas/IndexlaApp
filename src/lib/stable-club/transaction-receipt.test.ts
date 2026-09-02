import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import {
  assertSuccessfulTransactionReceipt,
  executeSequentialSuccessfulTransactions,
  isSuccessfulTransactionReceipt,
  TransactionRevertedError,
  waitForSuccessfulTransactionReceipt,
} from "@/lib/stable-club/transaction-receipt";

const HASH = "0xabc" as Hex;

describe("transaction-receipt (SC-F01)", () => {
  it("accepts success receipts", () => {
    expect(isSuccessfulTransactionReceipt({ status: "success" })).toBe(true);
    expect(() => assertSuccessfulTransactionReceipt({ status: "success" }, HASH)).not.toThrow();
  });

  it("fails closed on reverted receipts", () => {
    expect(isSuccessfulTransactionReceipt({ status: "reverted" })).toBe(false);
    expect(() => assertSuccessfulTransactionReceipt({ status: "reverted" }, HASH)).toThrow(
      TransactionRevertedError,
    );
    try {
      assertSuccessfulTransactionReceipt({ status: "reverted", transactionHash: HASH }, HASH);
    } catch (err) {
      expect(err).toBeInstanceOf(TransactionRevertedError);
      expect((err as TransactionRevertedError).receiptStatus).toBe("reverted");
      expect((err as TransactionRevertedError).hash).toBe(HASH);
      expect((err as TransactionRevertedError).message).toMatch(/failed on-chain/);
    }
  });

  it("fails closed on missing or unknown receipt status", () => {
    expect(() => assertSuccessfulTransactionReceipt(null, HASH)).toThrow(TransactionRevertedError);
    expect(() => assertSuccessfulTransactionReceipt(undefined, HASH)).toThrow(
      TransactionRevertedError,
    );
    expect(() => assertSuccessfulTransactionReceipt({}, HASH)).toThrow(TransactionRevertedError);
    expect(() => assertSuccessfulTransactionReceipt({ status: null }, HASH)).toThrow(
      TransactionRevertedError,
    );
    expect(() => assertSuccessfulTransactionReceipt({ status: "" }, HASH)).toThrow(
      TransactionRevertedError,
    );
    expect(() => assertSuccessfulTransactionReceipt({ status: "pending" as never }, HASH)).toThrow(
      /unknown|failed on-chain|pending/i,
    );
  });

  it("waitForSuccessfulTransactionReceipt throws on reverted mined tx", async () => {
    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted", transactionHash: HASH }),
    };
    await expect(waitForSuccessfulTransactionReceipt(publicClient, HASH)).rejects.toBeInstanceOf(
      TransactionRevertedError,
    );
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it("waitForSuccessfulTransactionReceipt returns success receipts", async () => {
    const publicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", transactionHash: HASH }),
    };
    const receipt = await waitForSuccessfulTransactionReceipt(publicClient, HASH);
    expect(receipt.status).toBe("success");
  });

  it("executeSequentialSuccessfulTransactions stops after first failed receipt", async () => {
    const step1 = vi.fn().mockResolvedValue("0x1" as Hex);
    const step2 = vi.fn().mockResolvedValue("0x2" as Hex);
    const waitForSuccess = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new TransactionRevertedError("reverted", "0x2" as Hex));

    await expect(
      executeSequentialSuccessfulTransactions({
        steps: [step1, step2],
        waitForSuccess,
      }),
    ).rejects.toBeInstanceOf(TransactionRevertedError);

    expect(step1).toHaveBeenCalledOnce();
    expect(step2).toHaveBeenCalledOnce();
    expect(waitForSuccess).toHaveBeenCalledTimes(2);
  });

  it("executeSequentialSuccessfulTransactions does not run later steps when wait fails on first", async () => {
    const step1 = vi.fn().mockResolvedValue("0x1" as Hex);
    const step2 = vi.fn().mockResolvedValue("0x2" as Hex);
    const waitForSuccess = vi
      .fn()
      .mockRejectedValueOnce(new TransactionRevertedError("reverted", "0x1" as Hex));

    await expect(
      executeSequentialSuccessfulTransactions({
        steps: [step1, step2],
        waitForSuccess,
      }),
    ).rejects.toBeInstanceOf(TransactionRevertedError);

    expect(step1).toHaveBeenCalledOnce();
    expect(step2).not.toHaveBeenCalled();
  });
});
