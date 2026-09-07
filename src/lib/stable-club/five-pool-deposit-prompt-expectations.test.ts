import { describe, expect, it } from "vitest";
import {
  evaluateClFivePoolPermit2Readiness,
  FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC,
} from "@/lib/stable-club/five-pool-permit2";

/**
 * Documents expected wallet confirmation counts for the current app-only path
 * (no contract batching). EIP-5792 is not a guarantee across wallets.
 */
describe("five-pool deposit wallet prompt expectations (app-only)", () => {
  const gross = BigInt(20_000_000);
  const now = 1_700_000_000;

  it("first deposit with zero allowances needs ERC20 + Permit2 approvals", () => {
    const readiness = evaluateClFivePoolPermit2Readiness({
      requiredGrossUsdc: gross,
      nowSec: now,
      allowances: {
        erc20AllowanceToPermit2: BigInt(0),
        permit2AmountToExecutor: BigInt(0),
        permit2ExpirationToExecutor: 0,
      },
    });
    expect(readiness.needsErc20Approve).toBe(true);
    expect(readiness.needsPermit2Approve).toBe(true);
    expect(readiness.ready).toBe(false);
    // + optional registerFivePoolStrategy + depositFivePoolStrategy = up to 4 prompts today
  });

  it("later deposit with valid Permit2 coverage needs no approval txs", () => {
    const readiness = evaluateClFivePoolPermit2Readiness({
      requiredGrossUsdc: gross,
      nowSec: now,
      allowances: {
        erc20AllowanceToPermit2: gross,
        permit2AmountToExecutor: gross,
        permit2ExpirationToExecutor: now + FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC,
      },
    });
    expect(readiness.needsErc20Approve).toBe(false);
    expect(readiness.needsPermit2Approve).toBe(false);
    expect(readiness.ready).toBe(true);
    // Registered user + ready allowances → ideally 1 wallet prompt (deposit only)
  });

  it("keeps short Permit2 TTL (security limit unchanged)", () => {
    expect(FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC).toBe(30 * 60);
    expect(FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC).toBeLessThanOrEqual(3600);
  });
});
