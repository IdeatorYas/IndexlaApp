import { describe, expect, it } from "vitest";
import {
  ERC20_UNLIMITED_APPROVAL,
  PERMIT2_UNLIMITED_AMOUNT,
  assertBoundedErc20ApproveAmount,
  assertBoundedPermit2Amount,
  assertDualSpenderAllowancesReady,
  buildBoundedErc20ApproveToPermit2,
  buildBoundedPermit2ApproveTx,
  buildDualSpenderDepositApprovalPlan,
  buildPermit2ZeroAllowanceRevokeTx,
  isForbiddenUnlimitedApproval,
  resolvePermit2Address,
  splitDepositSpenderAllowances,
} from "@/lib/stable-club/permit2";
import {
  assertGasCeilingFounderApproved,
  assertProductionGovernanceReady,
  assertProductionOracleDocsConfirmed,
  assertProductionPermit2Ready,
  evaluateMainnetReadiness,
  isStage0EoaEnvironment,
} from "@/lib/stable-club/production-guards";
import {
  BASE_ORACLE_FEEDS,
  BASE_PERMIT2,
  BASE_SAFE_STACK,
  REJECTED_ORACLE_CANDIDATES,
  isCanonicalBasePermit2,
  oraclesPendingOfficialDocsConfirmation,
} from "@/lib/stable-club/verified-base-addresses";
import { isForbiddenApprovalMethod } from "@/lib/stable-club/nft-approval";

const FEE = "0x1111111111111111111111111111111111111111" as const;
const EXEC = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const MOCK_P2 = "0x3333333333333333333333333333333333333333" as const;

describe("Permit2 bounded approvals", () => {
  it("rejects unlimited Permit2 and ERC20 amounts", () => {
    expect(() => assertBoundedPermit2Amount(PERMIT2_UNLIMITED_AMOUNT)).toThrow(/Unlimited/);
    expect(() => assertBoundedErc20ApproveAmount(ERC20_UNLIMITED_APPROVAL)).toThrow(/Unlimited/);
    expect(isForbiddenUnlimitedApproval(PERMIT2_UNLIMITED_AMOUNT)).toBe(true);
  });

  it("builds bounded Permit2 + ERC20 approve txs", () => {
    const now = 1_700_000_000;
    const p2 = buildBoundedPermit2ApproveTx({
      token: TOKEN,
      spender: FEE,
      amount: BigInt(1_000_000),
      expiration: now + 3600,
      nowSec: now,
    });
    expect(p2.address).toBe(BASE_PERMIT2.address);
    expect(p2.args[2]).toBe(BigInt(1_000_000));

    const erc20 = buildBoundedErc20ApproveToPermit2({
      token: TOKEN,
      amount: BigInt(5_000_000),
    });
    expect(erc20.args[0]).toBe(BASE_PERMIT2.address);
  });

  it("keeps NFT setApprovalForAll forbidden", () => {
    expect(isForbiddenApprovalMethod("setApprovalForAll")).toBe(true);
  });
});

describe("dual-spender Permit2 deposit split", () => {
  it("splits FeeRouter=swap and Executor=deposit-swap without duplicating gross", () => {
    const split = splitDepositSpenderAllowances({
      depositAmount: BigInt(1_000_000),
      swapAmount: BigInt(400_000),
    });
    expect(split.feeRouterAmount).toBe(BigInt(400_000));
    expect(split.executorAmount).toBe(BigInt(600_000));
    expect(split.erc20ToPermit2Amount).toBe(BigInt(1_000_000));
  });

  it("builds separate bounded approve txs per spender", () => {
    const now = 1_700_000_000;
    const plan = buildDualSpenderDepositApprovalPlan({
      token: TOKEN,
      feeRouter: FEE,
      executor: EXEC,
      depositAmount: BigInt(1_000_000),
      swapAmount: BigInt(250_000),
      expiration: now + 7200,
      nowSec: now,
    });
    expect(plan.feeRouterPermit2Tx?.args[1]).toBe(FEE);
    expect(plan.feeRouterPermit2Tx?.args[2]).toBe(BigInt(250_000));
    expect(plan.executorPermit2Tx?.args[1]).toBe(EXEC);
    expect(plan.executorPermit2Tx?.args[2]).toBe(BigInt(750_000));
    expect(plan.erc20ApproveTx?.args[1]).toBe(BigInt(1_000_000));
  });

  it("skips FeeRouter approve when swapAmount=0", () => {
    const now = 1_700_000_000;
    const plan = buildDualSpenderDepositApprovalPlan({
      token: TOKEN,
      feeRouter: FEE,
      executor: EXEC,
      depositAmount: BigInt(500_000),
      swapAmount: BigInt(0),
      expiration: now + 3600,
      nowSec: now,
    });
    expect(plan.feeRouterPermit2Tx).toBeNull();
    expect(plan.executorPermit2Tx?.args[2]).toBe(BigInt(500_000));
  });

  it("gates readiness: expiry, revoke, insufficient, wrong executor", () => {
    const now = 1_700_000_000;
    const base = {
      nowSec: now,
      expectedExecutor: EXEC,
      allowances: [
        {
          role: "feeRouter" as const,
          spender: FEE,
          required: BigInt(100),
          amount: BigInt(100),
          expiration: now + 60,
        },
        {
          role: "executor" as const,
          spender: EXEC,
          required: BigInt(200),
          amount: BigInt(200),
          expiration: now + 60,
        },
      ],
    };
    expect(() => assertDualSpenderAllowancesReady(base)).not.toThrow();

    expect(() =>
      assertDualSpenderAllowancesReady({
        ...base,
        allowances: [
          base.allowances[0],
          { ...base.allowances[1], expiration: now - 1 },
        ],
      }),
    ).toThrow(/expired/);

    expect(() =>
      assertDualSpenderAllowancesReady({
        ...base,
        allowances: [
          base.allowances[0],
          { ...base.allowances[1], amount: BigInt(0) },
        ],
      }),
    ).toThrow(/revoked/);

    expect(() =>
      assertDualSpenderAllowancesReady({
        ...base,
        allowances: [
          base.allowances[0],
          { ...base.allowances[1], amount: BigInt(50) },
        ],
      }),
    ).toThrow(/Insufficient/);

    expect(() =>
      assertDualSpenderAllowancesReady({
        ...base,
        allowances: [
          base.allowances[0],
          { ...base.allowances[1], spender: FEE },
        ],
      }),
    ).toThrow(/Wrong executor/);

    const revoke = buildPermit2ZeroAllowanceRevokeTx({
      token: TOKEN,
      spender: FEE,
      nowSec: now,
    });
    expect(revoke.args[2]).toBe(BigInt(0));
  });
});

describe("canonical Permit2 enforcement", () => {
  it("rejects custom/zero/non-canonical on Base mainnet", () => {
    expect(resolvePermit2Address({ chainId: 8453 })).toBe(BASE_PERMIT2.address);
    expect(() =>
      resolvePermit2Address({
        chainId: 8453,
        permit2: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrow(/Non-canonical/);
    expect(() => resolvePermit2Address({ chainId: 8453, permit2: MOCK_P2 })).toThrow(
      /Non-canonical/,
    );
    expect(() =>
      buildBoundedPermit2ApproveTx({
        chainId: 8453,
        permit2: MOCK_P2,
        token: TOKEN,
        spender: FEE,
        amount: BigInt(1),
        expiration: 2_000_000_000,
        nowSec: 1_700_000_000,
      }),
    ).toThrow(/Non-canonical/);
  });

  it("allows mock Permit2 only on non-Base (local/test) chains", () => {
    expect(resolvePermit2Address({ chainId: 31337, permit2: MOCK_P2 })).toBe(MOCK_P2);
    const tx = buildBoundedPermit2ApproveTx({
      chainId: 31337,
      permit2: MOCK_P2,
      token: TOKEN,
      spender: FEE,
      amount: BigInt(10),
      expiration: 2_000_000_000,
      nowSec: 1_700_000_000,
    });
    expect(tx.address).toBe(MOCK_P2);
  });
});

describe("production governance guards", () => {
  it("allows Stage 0 EOAs only on local/testnet", () => {
    expect(isStage0EoaEnvironment("local")).toBe(true);
    expect(isStage0EoaEnvironment("testnet")).toBe(true);
    expect(isStage0EoaEnvironment("mainnet")).toBe(false);
  });

  it("blocks mainnet when governance Safe mismatches MVP", () => {
    expect(() =>
      assertProductionGovernanceReady({
        environment: "mainnet",
        governanceSafeAddress: "0x1111111111111111111111111111111111111111",
        timelockAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x2222222222222222222222222222222222222222",
      }),
    ).toThrow(/must match MVP/);
  });

  it("blocks mainnet without canonical Permit2", () => {
    expect(() =>
      assertProductionPermit2Ready({
        environment: "mainnet",
        permit2Address: "0x1111111111111111111111111111111111111111",
        chainId: 8453,
      }),
    ).toThrow(/canonical/);
    expect(() =>
      assertProductionPermit2Ready({
        environment: "mainnet",
        permit2Address: BASE_PERMIT2.address,
        chainId: 8453,
      }),
    ).not.toThrow();
  });

  it("blocks mainnet while oracle feeds unverified only when registry incomplete", () => {
    expect(() => assertProductionOracleDocsConfirmed("local")).not.toThrow();
    expect(() => assertProductionOracleDocsConfirmed("mainnet")).not.toThrow();
  });

  it("encodes founder-approved gas ceiling (Timelock-adjustable only)", () => {
    expect(() => assertGasCeilingFounderApproved()).not.toThrow();
  });

  it("reports mainnet readiness blockers", () => {
    const r = evaluateMainnetReadiness({
      environment: "mainnet",
      ownerIsTimelock: false,
      timelockDelaySeconds: 48 * 3600,
      governanceSafeAddress: null,
      multisigSignersConfigured: false,
      permit2Address: null,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("multisig signers not configured");
    expect(r.blockers).toContain("Permit2 not canonical");
  });
});

describe("verified Base addresses registry", () => {
  it("pins canonical Permit2, Safe preinstalls, and Stage 1 oracles", () => {
    expect(isCanonicalBasePermit2(BASE_PERMIT2.address)).toBe(true);
    expect(BASE_SAFE_STACK.safeL2Singleton.verifiedOnFork).toBe(true);
    expect(BASE_ORACLE_FEEDS.usdcUsd.descriptionOnChain).toBe("USDC / USD");
    expect(BASE_ORACLE_FEEDS.cbBtcUsd.descriptionOnChain).toBe("cbBTC / USD");
    expect(BASE_ORACLE_FEEDS.btcUsd.descriptionOnChain).toBe("BTC / USD");
    expect(oraclesPendingOfficialDocsConfirmation()).toEqual([]);
    expect(REJECTED_ORACLE_CANDIDATES.length).toBeGreaterThan(0);
  });
});
