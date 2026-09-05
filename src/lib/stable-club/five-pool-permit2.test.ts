/**
 * Regression: live five-pool deposit must not hit Permit2 AllowanceExpired(0).
 */
import { describe, expect, it } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Address,
  type Hex,
} from "viem";
import {
  assertClFivePoolPermit2Ready,
  buildClFivePoolPermit2Plan,
  computeClFivePoolPermit2Expiration,
  evaluateClFivePoolPermit2Readiness,
  FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC,
  needsPermit2AllowanceToClExecutor,
  needsUsdcAllowanceToPermit2,
} from "@/lib/stable-club/five-pool-permit2";
import {
  formatPermit2UserError,
  permit2AllowanceAbi,
} from "@/lib/stable-club/permit2";
import { runFivePoolDepositApprovalSequence } from "@/lib/stable-club/five-pool-deposit";
import { BASE_PERMIT2 } from "@/lib/stable-club/verified-base-addresses";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const CL_EXEC = "0x1cdE442a760Ddda54087081aF9860471Dc099a9f" as Address;
const GROSS = 20n * 10n ** 6n; // 20 USDC
const NOW = 1_700_000_000;

describe("five-pool Permit2 dual-allowance readiness", () => {
  it("requires USDC → canonical Permit2 when allowance is below exact deposit", () => {
    expect(needsUsdcAllowanceToPermit2(0n, GROSS)).toBe(true);
    expect(needsUsdcAllowanceToPermit2(GROSS - 1n, GROSS)).toBe(true);
    expect(needsUsdcAllowanceToPermit2(GROSS, GROSS)).toBe(false);
    expect(needsUsdcAllowanceToPermit2(GROSS + 1n, GROSS)).toBe(false);
  });

  it("treats Permit2 expiration 0 as needing approve (AllowanceExpired(0))", () => {
    expect(
      needsPermit2AllowanceToClExecutor({
        amount: GROSS,
        expiration: 0,
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
      }),
    ).toBe(true);
    expect(
      needsPermit2AllowanceToClExecutor({
        amount: GROSS,
        expiration: 0n,
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
      }),
    ).toBe(true);
  });

  it("requires Permit2 → CL Executor when amount or expiry is insufficient", () => {
    expect(
      needsPermit2AllowanceToClExecutor({
        amount: GROSS - 1n,
        expiration: NOW + 60,
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
      }),
    ).toBe(true);
    expect(
      needsPermit2AllowanceToClExecutor({
        amount: GROSS,
        expiration: NOW,
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
      }),
    ).toBe(true);
    expect(
      needsPermit2AllowanceToClExecutor({
        amount: GROSS,
        expiration: NOW + 60,
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
      }),
    ).toBe(false);
  });

  it("computes a short non-zero Permit2 expiry for the exact deposit plan", () => {
    const expiration = computeClFivePoolPermit2Expiration(NOW);
    expect(expiration).toBe(NOW + FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC);
    expect(expiration).toBeGreaterThan(NOW);
    expect(FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC).toBeGreaterThan(0);
    expect(FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC).toBeLessThanOrEqual(3600);

    const plan = buildClFivePoolPermit2Plan({
      chainId: 8453,
      token: USDC,
      clExecutor: CL_EXEC,
      grossUsdc: GROSS,
      expiration,
      nowSec: NOW,
    });
    expect(plan.permit2).toBe(BASE_PERMIT2.address);
    expect(plan.erc20ApproveTx.args[0]).toBe(BASE_PERMIT2.address);
    expect(plan.erc20ApproveTx.args[1]).toBe(GROSS);
    expect(plan.permit2ApproveTx.args[1]).toBe(CL_EXEC);
    expect(plan.permit2ApproveTx.args[2]).toBe(GROSS);
    expect(plan.permit2ApproveTx.args[3]).toBe(expiration);
    expect(plan.permit2ApproveTx.args[3]).not.toBe(0);
  });

  it("evaluate + assert: expiration 0 blocks deposit until refreshed after approve", () => {
    const expired = evaluateClFivePoolPermit2Readiness({
      requiredGrossUsdc: GROSS,
      nowSec: NOW,
      allowances: {
        erc20AllowanceToPermit2: GROSS,
        permit2AmountToExecutor: 0n,
        permit2ExpirationToExecutor: 0,
      },
    });
    expect(expired.needsErc20Approve).toBe(false);
    expect(expired.needsPermit2Approve).toBe(true);
    expect(expired.ready).toBe(false);
    expect(() =>
      assertClFivePoolPermit2Ready({
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
        allowances: {
          erc20AllowanceToPermit2: GROSS,
          permit2AmountToExecutor: 0n,
          permit2ExpirationToExecutor: 0,
        },
        permit2: BASE_PERMIT2.address,
        clExecutor: CL_EXEC,
      }),
    ).toThrow(/AllowanceExpired\(0\)/);

    const refreshed = {
      erc20AllowanceToPermit2: GROSS,
      permit2AmountToExecutor: GROSS,
      permit2ExpirationToExecutor: NOW + FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC,
    };
    expect(
      evaluateClFivePoolPermit2Readiness({
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
        allowances: refreshed,
      }).ready,
    ).toBe(true);
    expect(() =>
      assertClFivePoolPermit2Ready({
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
        allowances: refreshed,
        permit2: BASE_PERMIT2.address,
        clExecutor: CL_EXEC,
      }),
    ).not.toThrow();
  });

  it("approval sequence waits for each receipt before returning hashes", async () => {
    const order: string[] = [];
    const hashes = await runFivePoolDepositApprovalSequence({
      nowSec: () => NOW,
      quotes: {},
      deadline: BigInt(NOW + 3600),
      maxQuoteAgeSec: 90,
      minRemainingSec: 30,
      erc20Approve: async () => {
        order.push("erc20-write");
        return "0xerc20" as Hex;
      },
      permit2Approve: async () => {
        order.push("permit2-write");
        return "0xpermit2" as Hex;
      },
      waitForSuccess: async (hash) => {
        order.push(`receipt:${hash}`);
      },
    });
    expect(hashes).toEqual(["0xerc20", "0xpermit2"]);
    expect(order).toEqual([
      "erc20-write",
      "receipt:0xerc20",
      "permit2-write",
      "receipt:0xpermit2",
    ]);
  });

  it("deposit is blocked if allowances are not refreshed after approvals", async () => {
    // Simulates: approvals ran, but on-chain still shows expiration 0 → must not deposit.
    let depositCalled = false;
    const postApproveAllowances = {
      erc20AllowanceToPermit2: GROSS,
      permit2AmountToExecutor: 0n,
      permit2ExpirationToExecutor: 0,
    };
    try {
      assertClFivePoolPermit2Ready({
        requiredGrossUsdc: GROSS,
        nowSec: NOW,
        allowances: postApproveAllowances,
        permit2: BASE_PERMIT2.address,
        clExecutor: CL_EXEC,
      });
      depositCalled = true;
    } catch (err) {
      expect(err instanceof Error ? err.message : "").toMatch(/AllowanceExpired\(0\)/);
    }
    expect(depositCalled).toBe(false);
  });
});

describe("formatPermit2UserError", () => {
  it("decodes AllowanceExpired(0) from revert data", () => {
    const data = encodeErrorResult({
      abi: permit2AllowanceAbi,
      errorName: "AllowanceExpired",
      args: [0n],
    });
    const err = new BaseError("execution reverted", {
      cause: new ContractFunctionRevertedError({
        abi: permit2AllowanceAbi,
        functionName: "depositFivePoolStrategy",
        data,
      }),
    });
    const msg = formatPermit2UserError(err);
    expect(msg).toMatch(/AllowanceExpired\(0\)/);
    expect(msg).toMatch(/never approved|revoked/i);
    expect(msg).toMatch(/short non-zero expiry/i);
  });

  it("decodes InsufficientAllowance from revert data", () => {
    const data = encodeErrorResult({
      abi: permit2AllowanceAbi,
      errorName: "InsufficientAllowance",
      args: [1n],
    });
    const err = new BaseError("execution reverted", {
      cause: new ContractFunctionRevertedError({
        abi: permit2AllowanceAbi,
        functionName: "transferFrom",
        data,
      }),
    });
    const msg = formatPermit2UserError(err);
    expect(msg).toMatch(/InsufficientAllowance\(1\)/);
    expect(msg).toMatch(/exact deposit amount/i);
  });

  it("parses AllowanceExpired(0) from plain message fallback", () => {
    const msg = formatPermit2UserError(new Error("Permit2: AllowanceExpired(0)"));
    expect(msg).toMatch(/AllowanceExpired/);
    expect(msg).toMatch(/deadline=0/i);
  });
});
