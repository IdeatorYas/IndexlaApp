import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import {
  computeStableClubPermissionId,
  computeStableClubScopedPermissionId,
  PERMISSION_SCOPE_COMPOUND,
  PERMISSION_SCOPE_REBALANCE,
} from "@/lib/stable-club/permission-id";
import {
  buildRebalanceOptInPermissionScope,
  REBALANCE_OPENSERV_CONNECTED,
  validateRebalanceSpendParams,
} from "@/lib/stable-club/rebalance-validation";
import {
  rebalanceAutomationStatusMessage,
  validateRebalanceEnvironment,
} from "@/lib/stable-club/rebalance";
import { buildRebalanceProposal, hashRebalanceProposal } from "@/lib/stable-club/openserv";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";

const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ADAPTER = "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f" as Address;
const TOKEN_A = "0x0165878A594ca255338adfa4d48449f69242Eb8F" as Address;
const TOKEN_B = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as Address;
const POOL = `0x${"11".repeat(32)}` as Hex;
const PERMISSION = `0x${"22".repeat(32)}` as Hex;
const IDEMPOTENCY = `0x${"33".repeat(32)}` as Hex;

function deployments(network: StableClubLocalDeployments["network"]): StableClubLocalDeployments {
  return {
    chainId: 31337,
    network,
    isTestOnly: true,
    label: "test",
    deployedAt: new Date().toISOString(),
    deployer: USER,
    testUser: USER,
    feeRecipient: USER,
    permissionRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    feeRouter: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    executor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    automationExecutor: "0x1234567890123456789012345678901234567890",
    safetyController: "0x2345678901234567890123456789012345678901",
    testAdapter: ADAPTER,
    usdc: TOKEN_A,
    weth: TOKEN_B,
    poolId: POOL,
    rpcUrl: "http://127.0.0.1:8545",
  };
}

describe("rebalance app layer", () => {
  it("uses a scope distinct from legacy and compound", () => {
    const common = { user: USER, chainId: 31337, poolId: POOL, tokenA: TOKEN_A, tokenB: TOKEN_B };
    const legacy = computeStableClubPermissionId(common);
    const compound = computeStableClubScopedPermissionId({ ...common, scope: PERMISSION_SCOPE_COMPOUND });
    const rebalance = computeStableClubScopedPermissionId({ ...common, scope: PERMISSION_SCOPE_REBALANCE });
    expect(rebalance).not.toBe(legacy);
    expect(rebalance).not.toBe(compound);
  });

  it("scales limits using required tokenA decimals", () => {
    const scope = buildRebalanceOptInPermissionScope({
      user: USER,
      chainId: 31337,
      poolId: POOL,
      tokenA: TOKEN_A,
      tokenB: TOKEN_B,
      tokenADecimals: 8,
    });
    expect(scope.maxAmountPerTx).toBe(BigInt(5_000) * BigInt(10) ** BigInt(8));
    expect(scope.allowedActions).toEqual([
      "rebalance",
      "pause-automation",
      "revoke-permission",
      "emergency-exit",
    ]);
  });

  it("keeps launch and OpenServ rebalance disabled without explicit local opt-in", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.rebalanceEnabled).toBe(false);
    expect(REBALANCE_OPENSERV_CONNECTED).toBe(false);
    expect(rebalanceAutomationStatusMessage()).toContain("unavailable");
    const result = validateRebalanceEnvironment(deployments("base"), true);
    expect(result).toMatchObject({ ok: false, code: "launch-rebalance-disabled" });
    expect(validateRebalanceEnvironment(deployments("hardhat-local"), true)).toMatchObject({
      ok: false,
      code: "launch-rebalance-disabled",
    });
    expect(
      validateRebalanceEnvironment(
        { ...deployments("hardhat-local"), localAutomationBypass: true },
        true,
      ),
    ).toEqual({ ok: true });
  });

  it("validates close/swap mins and tick order", () => {
    const valid = {
      newTickLower: -90000,
      newTickUpper: -80000,
      swapAmount: BigInt(0),
      minAmountOut: BigInt(0),
      closeAmountAMin: BigInt(1),
      closeAmountBMin: BigInt(1),
    };
    expect(validateRebalanceSpendParams(valid).ok).toBe(true);
    expect(validateRebalanceSpendParams({ ...valid, closeAmountAMin: BigInt(0) }))
      .toMatchObject({ ok: false, code: "slippage-min-required" });
    expect(validateRebalanceSpendParams({ ...valid, swapAmount: BigInt(1) }))
      .toMatchObject({ ok: false, code: "slippage-min-required" });
    expect(validateRebalanceSpendParams({ ...valid, newTickLower: -70000 }))
      .toMatchObject({ ok: false, code: "invalid-tick-range" });
  });

  it("hashes OpenServ fields in Solidity order", () => {
    const proposal = buildRebalanceProposal({
      chainId: 31337,
      user: USER,
      permissionId: PERMISSION,
      poolId: POOL,
      adapter: ADAPTER,
      positionTokenId: BigInt(1),
      executionNonce: BigInt(1),
      deadline: BigInt(2_000_000_000),
      idempotencyKey: IDEMPOTENCY,
      tokenA: TOKEN_A,
      tokenB: TOKEN_B,
      newTickLower: -90000,
      newTickUpper: -80000,
      swapAmount: BigInt(0),
      minAmountOut: BigInt(0),
      quotedAmountOut: BigInt(0),
      closeAmountAMin: BigInt(1),
      closeAmountBMin: BigInt(1),
      mintAmountAMin: BigInt(1),
      mintAmountBMin: BigInt(1),
      slippageBps: BigInt(150),
      swapDeadline: BigInt(2_000_000_000),
    });
    expect(proposal).not.toBeNull();
    expect(proposal!.proposalId).toBe(hashRebalanceProposal(proposal!.fields));
  });
});
