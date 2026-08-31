import { describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
import { CompoundAuditStore } from "@/lib/stable-club/compound-audit";
import {
  compoundAutomationStatusMessage,
  executeAuthorizedCompound,
  mapCompoundResultToUiStatus,
  readOnChainTokenDecimals,
  validateCompoundEnvironment,
  type ExecuteCompoundInput,
} from "@/lib/stable-club/compound";
import {
  buildCompoundOptInPermissionScope,
  COMPOUND_OPENSERV_CONNECTED,
  deriveCompoundSpendFromLiveFees,
  mapCollectibleFeesToTokenAB,
  permissionMaskIncludesCompound,
  validateCompoundPermissionSnapshot,
  validateCompoundProposalBinding,
  validateCompoundSpendParams,
  type CompoundValidationCode,
  type CompoundValidationResult,
} from "@/lib/stable-club/compound-validation";
import {
  computeStableClubPermissionId,
  computeStableClubScopedPermissionId,
  PERMISSION_SCOPE_COMPOUND,
} from "@/lib/stable-club/permission-id";
import { buildCompoundProposal, hashCompoundProposal } from "@/lib/stable-club/openserv";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { TransactionRevertedError } from "@/lib/stable-club/transaction-receipt";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import { encodeAllowedActions } from "@/lib/stable-club/permissions";

const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ADAPTER = "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f" as Address;
const NPM = "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c" as Address;
const POOL_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
const PERM_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;
const USDC = "0x0165878A594ca255338adfa4d48449f69242Eb8F" as Address;
const WETH = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as Address;
const CBBTC = "0xBBbBbbBBbbBBBbbbBbbbbBBbBbbbbBBbBbbBBbBB" as Address;
const IDEM =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex;

const COMPOUND_ACTION_MASK = BigInt(encodeAllowedActions(["compound"]));

function expectRejected(result: CompoundValidationResult, code: CompoundValidationCode): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

function baseDeployments(): StableClubLocalDeployments {
  return {
    chainId: 31337,
    network: "hardhat-local",
    isTestOnly: true,
    label: "test",
    deployedAt: new Date().toISOString(),
    deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    testUser: USER,
    feeRecipient: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    permissionRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    feeRouter: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    executor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    automationExecutor: "0x1234567890123456789012345678901234567890",
    safetyController: "0x2345678901234567890123456789012345678901",
    testAdapter: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    usdc: USDC,
    weth: WETH,
    poolId: POOL_HASH,
    rpcUrl: "http://127.0.0.1:8545",
    step2Adapters: [{ chainId: 31337, poolId: "USDC-cbBTC-UNI-005", adapter: ADAPTER, npm: NPM }],
  };
}

async function readMockContract(args: unknown): Promise<unknown> {
  const functionName = (args as { functionName?: string }).functionName;
  if (functionName === "getPermission") {
    return {
      user: USER,
      chainId: BigInt(31337),
      poolId: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      allowedActions: COMPOUND_ACTION_MASK,
      maxAmountPerTx: BigInt(5_000_000_000),
      maxAmountPerDay: BigInt(20_000_000_000),
      maxSlippageBps: BigInt(500),
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 3600),
      revoked: false,
      paused: false,
    };
  }
  if (functionName === "poolId") return POOL_HASH;
  if (functionName === "ownerOf") return USER;
  if (functionName === "getApproved") return ADAPTER;
  if (functionName === "positionTokens") return [USDC, WETH];
  if (functionName === "collectibleFees") return [BigInt(1_000_000), BigInt(2_000_000)];
  if (functionName === "isAutomationPaused") return false;
  return null;
}

function mockPublicClient(
  overrides: Partial<ExecuteCompoundInput["publicClient"]> = {},
): ExecuteCompoundInput["publicClient"] {
  return {
    getBytecode: vi.fn(async () => "0x1234" as Hex),
    readContract: vi.fn(readMockContract),
    waitForTransactionReceipt: vi.fn(async () => ({
      status: "success",
      transactionHash: "0xabc" as Hex,
    })),
    ...overrides,
  };
}

function baseSpend() {
  return {
    rewardToken: USDC,
    tokenA: USDC,
    tokenB: WETH,
    swapAmount: BigInt(0),
    minAmountOut: BigInt(0),
    amountA: BigInt(1_000_000),
    amountB: BigInt(1_000_000),
    amountAMin: BigInt(1),
    amountBMin: BigInt(1),
    slippageBps: BigInt(150),
    swapDeadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    quotedAmountOut: BigInt(0),
  };
}

describe("scoped permission ids", () => {
  it("legacy and compound-scoped ids differ for the same user/pool/tokens", () => {
    const legacy = computeStableClubPermissionId({
      user: USER,
      chainId: 31337,
      poolId: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
    });
    const scoped = computeStableClubScopedPermissionId({
      user: USER,
      chainId: 31337,
      poolId: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      scope: PERMISSION_SCOPE_COMPOUND,
    });
    expect(scoped).not.toBe(legacy);
    expect(PERMISSION_SCOPE_COMPOUND).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});

describe("compound permission scope", () => {
  it("builds compound opt-in with compound bit, tokenA decimals limits and slippage", () => {
    const scope = buildCompoundOptInPermissionScope({
      user: USER,
      chainId: 31337,
      poolId: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      tokenADecimals: 6,
    });
    expect(scope.allowedActions).toEqual([
      "compound",
      "pause-automation",
      "revoke-permission",
      "emergency-exit",
    ]);
    expect(scope.maxAmountPerTx).toBe(BigInt(5_000_000_000));
    expect(scope.maxAmountPerDay).toBe(BigInt(20_000_000_000));
    expect(scope.maxSlippageBps).toBe(500);
    expect(permissionMaskIncludesCompound(COMPOUND_ACTION_MASK)).toBe(true);
    expect(permissionMaskIncludesCompound(BigInt(1) << BigInt(8))).toBe(false);
  });

  it("uses non-USDC tokenA decimals for limit scaling", () => {
    const scope = buildCompoundOptInPermissionScope({
      user: USER,
      chainId: 31337,
      poolId: POOL_HASH,
      tokenA: CBBTC,
      tokenB: USDC,
      tokenADecimals: 8,
    });
    expect(scope.maxAmountPerTx).toBe(BigInt(5_000) * BigInt(10) ** BigInt(8));
    expect(scope.maxAmountPerDay).toBe(BigInt(20_000) * BigInt(10) ** BigInt(8));
    expect(scope.maxAmountPerTx).not.toBe(BigInt(5_000_000_000));
  });

  it("rejects permissions without compound bit", () => {
    const now = Math.floor(Date.now() / 1000);
    expectRejected(
      validateCompoundPermissionSnapshot(
        {
          user: USER,
          chainId: BigInt(31337),
          poolId: POOL_HASH,
          tokenA: USDC,
          tokenB: WETH,
          allowedActions: BigInt(1) << BigInt(8),
          maxAmountPerTx: BigInt(0),
          maxAmountPerDay: BigInt(0),
          maxSlippageBps: BigInt(0),
          expiresAt: BigInt(now + 100),
          revoked: false,
          paused: false,
        },
        { user: USER, chainId: 31337, poolId: POOL_HASH },
        now,
      ),
      "compound-not-allowed",
    );
  });
});

describe("live collectible fees", () => {
  it("maps fee0/fee1 onto tokenA/tokenB", () => {
    const mapped = mapCollectibleFeesToTokenAB({
      tokenA: WETH,
      tokenB: USDC,
      fees: { token0: USDC, token1: WETH, fee0: BigInt(10), fee1: BigInt(20) },
    });
    expect(mapped).toEqual({ amountA: BigInt(20), amountB: BigInt(10) });
  });

  it("fail-closed when live fees missing or zero", () => {
    expectRejected(
      deriveCompoundSpendFromLiveFees({
        rewardToken: USDC,
        tokenA: USDC,
        tokenB: WETH,
        fees: null,
      }),
      "missing-live-fees",
    );
    expectRejected(
      deriveCompoundSpendFromLiveFees({
        rewardToken: USDC,
        tokenA: USDC,
        tokenB: WETH,
        fees: { token0: USDC, token1: WETH, fee0: BigInt(0), fee1: BigInt(0) },
      }),
      "missing-live-fees",
    );
    expectRejected(
      deriveCompoundSpendFromLiveFees({
        rewardToken: USDC,
        tokenA: USDC,
        tokenB: WETH,
        fees: { token0: CBBTC, token1: WETH, fee0: BigInt(1), fee1: BigInt(1) },
      }),
      "missing-live-fees",
    );
  });

  it("derives spend from live fees without hardcoded 1e6 defaults", () => {
    const derived = deriveCompoundSpendFromLiveFees({
      rewardToken: USDC,
      tokenA: USDC,
      tokenB: WETH,
      fees: { token0: USDC, token1: WETH, fee0: BigInt(42), fee1: BigInt(7) },
      slippageBps: BigInt(100),
      swapDeadlineSec: 1_700_000_000,
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.amountA).toBe(BigInt(42));
    expect(derived.amountB).toBe(BigInt(7));
    expect(derived.swapAmount).toBe(BigInt(0));
    expect(derived.amountA).not.toBe(BigInt(1_000_000));
  });
});

describe("on-chain tokenA decimals", () => {
  it("reads decimals from ERC20 and fails closed on error/out-of-range", async () => {
    const okClient = mockPublicClient({
      readContract: vi.fn(async (args: unknown) => {
        if ((args as { functionName?: string }).functionName === "decimals") return 8;
        return readMockContract(args);
      }),
    });
    expect(await readOnChainTokenDecimals(okClient, CBBTC)).toBe(8);

    const badClient = mockPublicClient({
      readContract: vi.fn(async () => {
        throw new Error("rpc");
      }),
    });
    expect(await readOnChainTokenDecimals(badClient, CBBTC)).toBeNull();

    const rangeClient = mockPublicClient({
      readContract: vi.fn(async () => 99),
    });
    expect(await readOnChainTokenDecimals(rangeClient, CBBTC)).toBeNull();
  });
});

describe("buildCompoundProposal hash/binding", () => {
  it("hashes fields exactly and rejects noop / missing mins", () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const built = buildCompoundProposal({
      chainId: 31337,
      user: USER,
      permissionId: PERM_ID,
      poolId: POOL_HASH,
      adapter: ADAPTER,
      positionTokenId: BigInt(1),
      executionNonce: BigInt(9),
      deadline: now + BigInt(3600),
      idempotencyKey: IDEM,
      rewardToken: USDC,
      tokenA: USDC,
      tokenB: WETH,
      swapAmount: BigInt(0),
      minAmountOut: BigInt(0),
      quotedAmountOut: BigInt(0),
      amountA: BigInt(1_000_000),
      amountB: BigInt(500_000),
      amountAMin: BigInt(1),
      amountBMin: BigInt(1),
      slippageBps: BigInt(150),
      swapDeadline: now + BigInt(600),
    });
    expect(built).not.toBeNull();
    if (!built) return;
    expect(built.proposalId).toBe(hashCompoundProposal(built.fields));
    expect(
      validateCompoundProposalBinding(built.fields, {
        chainId: 31337,
        user: USER,
        permissionId: PERM_ID,
        poolId: POOL_HASH,
        adapter: ADAPTER,
        positionTokenId: BigInt(1),
        executionNonce: BigInt(9),
      }).ok,
    ).toBe(true);

    expect(
      buildCompoundProposal({
        chainId: 31337,
        user: USER,
        permissionId: PERM_ID,
        poolId: POOL_HASH,
        adapter: ADAPTER,
        positionTokenId: BigInt(1),
        executionNonce: BigInt(1),
        deadline: now + BigInt(100),
        idempotencyKey: IDEM,
        rewardToken: USDC,
        tokenA: USDC,
        tokenB: WETH,
        swapAmount: BigInt(0),
        minAmountOut: BigInt(0),
        quotedAmountOut: BigInt(0),
        amountA: BigInt(0),
        amountB: BigInt(0),
        amountAMin: BigInt(0),
        amountBMin: BigInt(0),
        slippageBps: BigInt(100),
        swapDeadline: now + BigInt(50),
      }),
    ).toBeNull();

    expect(
      buildCompoundProposal({
        chainId: 31337,
        user: USER,
        permissionId: PERM_ID,
        poolId: POOL_HASH,
        adapter: ADAPTER,
        positionTokenId: BigInt(1),
        executionNonce: BigInt(1),
        deadline: now + BigInt(100),
        idempotencyKey: IDEM,
        rewardToken: USDC,
        tokenA: USDC,
        tokenB: WETH,
        swapAmount: BigInt(0),
        minAmountOut: BigInt(0),
        quotedAmountOut: BigInt(0),
        amountA: BigInt(100),
        amountB: BigInt(0),
        amountAMin: BigInt(0),
        amountBMin: BigInt(0),
        slippageBps: BigInt(100),
        swapDeadline: now + BigInt(50),
      }),
    ).toBeNull();
  });

  it("rejects binding mismatches", () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const built = buildCompoundProposal({
      chainId: 31337,
      user: USER,
      permissionId: PERM_ID,
      poolId: POOL_HASH,
      adapter: ADAPTER,
      positionTokenId: BigInt(1),
      executionNonce: BigInt(2),
      deadline: now + BigInt(100),
      idempotencyKey: IDEM,
      rewardToken: USDC,
      tokenA: USDC,
      tokenB: WETH,
      swapAmount: BigInt(0),
      minAmountOut: BigInt(0),
      quotedAmountOut: BigInt(0),
      amountA: BigInt(1),
      amountB: BigInt(0),
      amountAMin: BigInt(1),
      amountBMin: BigInt(0),
      slippageBps: BigInt(100),
      swapDeadline: now + BigInt(50),
    })!;
    expectRejected(
      validateCompoundProposalBinding(built.fields, {
        chainId: 31337,
        user: USER,
        permissionId: PERM_ID,
        poolId: POOL_HASH,
        adapter: ADAPTER,
        positionTokenId: BigInt(2),
        executionNonce: BigInt(2),
      }),
      "invalid-position-token-id",
    );
  });
});

describe("compound policy and UI honesty", () => {
  it("keeps launch compoundEnabled=false and disables outside hardhat-local", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.compoundEnabled).toBe(false);
    expect(COMPOUND_OPENSERV_CONNECTED).toBe(false);
    expect(compoundAutomationStatusMessage()).toContain("unavailable");

    const nonLocal = { ...baseDeployments(), network: "base" as const };
    expectRejected(validateCompoundEnvironment(nonLocal, true), "launch-compound-disabled");
    expectRejected(validateCompoundEnvironment(baseDeployments(), false), "opt-in-disabled");
  });

  it("maps receipt failure without mock-success", async () => {
    const publicClient = mockPublicClient({
      waitForTransactionReceipt: vi.fn(async () => {
        throw new TransactionRevertedError("reverted", "0xbad" as Hex);
      }),
    });
    const result = await executeAuthorizedCompound({
      deployments: baseDeployments(),
      verifiedAdapters: baseDeployments().step2Adapters!,
      walletAddress: USER,
      walletChainId: 31337,
      poolCatalogueId: "USDC-cbBTC-UNI-005",
      poolIdHash: POOL_HASH,
      positionTokenId: "1",
      permissionId: PERM_ID,
      executionNonce: BigInt(3),
      adapter: ADAPTER,
      optInEnabled: true,
      spend: baseSpend(),
      proposalDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      idempotencyKey: IDEM,
      manual: true,
      audit: new CompoundAuditStore(),
      publicClient,
      walletClient: { writeContract: vi.fn(async () => "0xbad" as Hex) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("tx-reverted");
    const ui = mapCompoundResultToUiStatus(result);
    expect(ui.status).toBe("failed");
    expect(ui.automationAvailable).toBe(false);
  });

  it("happy path: typed proposal, compound tx, confirmed receipt", async () => {
    const audit = new CompoundAuditStore();
    const walletClient = {
      writeContract: vi.fn(async (args: unknown) => {
        expect((args as { functionName: string }).functionName).toBe("compound");
        return "0xdeadbeef" as Hex;
      }),
    };
    const result = await executeAuthorizedCompound({
      deployments: baseDeployments(),
      verifiedAdapters: baseDeployments().step2Adapters!,
      walletAddress: USER,
      walletChainId: 31337,
      poolCatalogueId: "USDC-cbBTC-UNI-005",
      poolIdHash: POOL_HASH,
      positionTokenId: "1",
      permissionId: PERM_ID,
      executionNonce: BigInt(4),
      adapter: ADAPTER,
      optInEnabled: true,
      spend: baseSpend(),
      proposalDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      idempotencyKey: IDEM,
      manual: true,
      audit,
      publicClient: mockPublicClient(),
      walletClient,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receiptStatus).toBe("success");
      expect(result.proposalId).toMatch(/^0x[0-9a-f]{64}$/i);
    }
    expect(audit.list().some((e) => e.phase === "tx-confirmed")).toBe(true);
    expect(validateCompoundSpendParams(baseSpend()).ok).toBe(true);
    expectRejected(
      validateCompoundSpendParams({ ...baseSpend(), amountA: BigInt(0), amountB: BigInt(0) }),
      "noop-compound",
    );
  });
});
