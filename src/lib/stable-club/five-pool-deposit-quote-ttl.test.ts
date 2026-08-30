import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import {
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
  assertExecutableQuotePlanValidity,
  runFivePoolDepositApprovalSequence,
} from "@/lib/stable-club/five-pool-deposit";
import { createMockQuoteAdapter } from "@/lib/stable-club/five-pool-quotes";
import { QuotePlanError } from "@/lib/stable-club/quote-plan";
import { TransactionRevertedError } from "@/lib/stable-club/transaction-receipt";

const GROSS = BigInt(1000) * BigInt(10) ** BigInt(6);
const MAX_AGE = FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC;
const BUFFER = FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC;

async function freshQuotes(quotedAtSec: number) {
  const bundle = await createMockQuoteAdapter().fetchQuotes({
    grossUsdc: GROSS,
    nowSec: quotedAtSec,
  });
  return bundle.quotes;
}

function makeClock(startSec: number) {
  let now = startSec;
  return {
    nowSec: () => now,
    advance(bySec: number) {
      now += bySec;
    },
    set(atSec: number) {
      now = atSec;
    },
  };
}

describe("SC-F10 — executable quote TTL buffer", () => {
  it("exports a single shared minimum remaining-validity buffer", () => {
    expect(FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC).toBe(30);
    expect(FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC).toBeLessThan(MAX_AGE);
  });

  it("permits approval when remaining validity exceeds the buffer", async () => {
    const quotedAt = 1_000;
    const quotes = await freshQuotes(quotedAt);
    const deadline = BigInt(quotedAt + 3_600);
    // age 50 → remaining 40 >= 30
    expect(() =>
      assertExecutableQuotePlanValidity({
        quotes,
        deadline,
        nowSec: quotedAt + 50,
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
      }),
    ).not.toThrow();

    const erc20Approve = vi.fn(async () => "0xerc20" as Hex);
    const permit2Approve = vi.fn(async () => "0xpermit2" as Hex);
    const hashes = await runFivePoolDepositApprovalSequence({
      nowSec: () => quotedAt + 50,
      quotes,
      deadline,
      maxQuoteAgeSec: MAX_AGE,
      minRemainingSec: BUFFER,
      erc20Approve,
      permit2Approve,
      waitForSuccess: async () => undefined,
    });
    expect(erc20Approve).toHaveBeenCalledTimes(1);
    expect(permit2Approve).toHaveBeenCalledTimes(1);
    expect(hashes).toEqual(["0xerc20", "0xpermit2"]);
  });

  it("blocks before wallet interaction when remaining TTL is below the buffer", async () => {
    const quotedAt = 1_000;
    const quotes = await freshQuotes(quotedAt);
    const deadline = BigInt(quotedAt + 3_600);
    const erc20Approve = vi.fn(async () => "0xerc20" as Hex);
    const permit2Approve = vi.fn(async () => "0xpermit2" as Hex);
    const waitForSuccess = vi.fn();

    // age 61 → remaining 29 < 30
    await expect(
      runFivePoolDepositApprovalSequence({
        nowSec: () => quotedAt + 61,
        quotes,
        deadline,
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
        erc20Approve,
        permit2Approve,
        waitForSuccess,
      }),
    ).rejects.toBeInstanceOf(QuotePlanError);

    expect(erc20Approve).not.toHaveBeenCalled();
    expect(permit2Approve).not.toHaveBeenCalled();
    expect(waitForSuccess).not.toHaveBeenCalled();
  });

  it("stops the sequence when TTL expires after the first approval — no second approval", async () => {
    const quotedAt = 1_000;
    const quotes = await freshQuotes(quotedAt);
    const deadline = BigInt(quotedAt + 3_600);
    const clock = makeClock(quotedAt + 10);
    const erc20Approve = vi.fn(async () => {
      clock.advance(55); // remaining after confirm: 90 - 65 = 25 < 30
      return "0xerc20" as Hex;
    });
    const permit2Approve = vi.fn(async () => "0xpermit2" as Hex);
    const waitForSuccess = vi.fn(async () => undefined);

    await expect(
      runFivePoolDepositApprovalSequence({
        nowSec: clock.nowSec,
        quotes,
        deadline,
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
        erc20Approve,
        permit2Approve,
        waitForSuccess,
      }),
    ).rejects.toMatchObject({ code: "STALE_QUOTE" });

    expect(erc20Approve).toHaveBeenCalledTimes(1);
    expect(waitForSuccess).toHaveBeenCalledTimes(1);
    expect(permit2Approve).not.toHaveBeenCalled();
  });

  it("blocks deposit write when TTL expires after approvals complete", async () => {
    const quotedAt = 1_000;
    const quotes = await freshQuotes(quotedAt);
    const deadline = BigInt(quotedAt + 3_600);
    const clock = makeClock(quotedAt + 5);

    const hashes = await runFivePoolDepositApprovalSequence({
      nowSec: clock.nowSec,
      quotes,
      deadline,
      maxQuoteAgeSec: MAX_AGE,
      minRemainingSec: BUFFER,
      erc20Approve: async () => "0xerc20" as Hex,
      permit2Approve: async () => "0xpermit2" as Hex,
      waitForSuccess: async () => undefined,
    });
    expect(hashes).toEqual(["0xerc20", "0xpermit2"]);

    clock.set(quotedAt + 70); // remaining 20 < 30
    const depositWrite = vi.fn(async () => "0xdeposit" as Hex);
    expect(() =>
      assertExecutableQuotePlanValidity({
        quotes,
        deadline,
        nowSec: clock.nowSec(),
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
      }),
    ).toThrow(QuotePlanError);
    expect(depositWrite).not.toHaveBeenCalled();
  });

  it("after plan refresh, continues without repeating confirmed allowances", async () => {
    const firstQuotedAt = 1_000;
    const firstQuotes = await freshQuotes(firstQuotedAt);
    const firstDeadline = BigInt(firstQuotedAt + 3_600);
    const clock = makeClock(firstQuotedAt + 10);

    const firstErc20 = vi.fn(async () => {
      clock.advance(55);
      return "0xerc20" as Hex;
    });
    const firstPermit2 = vi.fn(async () => "0xpermit2" as Hex);

    await expect(
      runFivePoolDepositApprovalSequence({
        nowSec: clock.nowSec,
        quotes: firstQuotes,
        deadline: firstDeadline,
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
        erc20Approve: firstErc20,
        permit2Approve: firstPermit2,
        waitForSuccess: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: "STALE_QUOTE" });
    expect(firstErc20).toHaveBeenCalledTimes(1);
    expect(firstPermit2).not.toHaveBeenCalled();

    // User refreshes quotes; ERC20 allowance already confirmed — pass null to skip.
    const refreshedAt = clock.nowSec();
    const refreshedQuotes = await freshQuotes(refreshedAt);
    const refreshedDeadline = BigInt(refreshedAt + 3_600);
    const refreshErc20 = vi.fn(async () => "0xerc20-again" as Hex);
    const refreshPermit2 = vi.fn(async () => "0xpermit2" as Hex);

    const hashes = await runFivePoolDepositApprovalSequence({
      nowSec: clock.nowSec,
      quotes: refreshedQuotes,
      deadline: refreshedDeadline,
      maxQuoteAgeSec: MAX_AGE,
      minRemainingSec: BUFFER,
      erc20Approve: null,
      permit2Approve: refreshPermit2,
      waitForSuccess: async () => undefined,
    });

    expect(refreshErc20).not.toHaveBeenCalled();
    expect(refreshPermit2).toHaveBeenCalledTimes(1);
    expect(hashes).toEqual(["0xpermit2"]);
  });

  it("reverted approval still fails closed and does not continue (SC-F01)", async () => {
    const quotedAt = 1_000;
    const quotes = await freshQuotes(quotedAt);
    const deadline = BigInt(quotedAt + 3_600);
    const erc20Approve = vi.fn(async () => "0xerc20" as Hex);
    const permit2Approve = vi.fn(async () => "0xpermit2" as Hex);
    const waitForSuccess = vi.fn(async (hash: Hex) => {
      throw new TransactionRevertedError("reverted", hash);
    });

    await expect(
      runFivePoolDepositApprovalSequence({
        nowSec: () => quotedAt + 10,
        quotes,
        deadline,
        maxQuoteAgeSec: MAX_AGE,
        minRemainingSec: BUFFER,
        erc20Approve,
        permit2Approve,
        waitForSuccess,
      }),
    ).rejects.toBeInstanceOf(TransactionRevertedError);

    expect(erc20Approve).toHaveBeenCalledTimes(1);
    expect(waitForSuccess).toHaveBeenCalledTimes(1);
    expect(permit2Approve).not.toHaveBeenCalled();
  });
});
