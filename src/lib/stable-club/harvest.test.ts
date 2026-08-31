import { describe, expect, it, vi } from "vitest";
import { type Address, type Hex } from "viem";
import { HarvestAuditStore } from "@/lib/stable-club/harvest-audit";
import {
  executeAuthorizedHarvest,
  validateHarvestEnvironment,
  validateHarvestPreconditions,
  type ExecuteHarvestInput,
} from "@/lib/stable-club/harvest";
import {
  buildHarvestOptInPermissionScope,
  permissionMaskIncludesHarvest,
  validateHarvestPermissionSnapshot,
  validateHarvestProposalBinding,
  type HarvestValidationCode,
  type HarvestValidationResult,
} from "@/lib/stable-club/harvest-validation";
import { OpenServMonitor, buildHarvestProposal } from "@/lib/stable-club/openserv";
import { TransactionRevertedError } from "@/lib/stable-club/transaction-receipt";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";

const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ADAPTER = "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f" as Address;
const NPM = "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c" as Address;
const POOL_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
const PERM_ID =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;
const USDC = "0x0165878A594ca255338adfa4d48449f69242Eb8F" as Address;
const WETH = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as Address;

const HARVEST_ACTION_MASK = BigInt(1) << BigInt(8);

function expectRejected(result: HarvestValidationResult, code: HarvestValidationCode): void {
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
      allowedActions: HARVEST_ACTION_MASK,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 3600),
      revoked: false,
      paused: false,
    };
  }
  if (functionName === "poolId") return POOL_HASH;
  if (functionName === "ownerOf") return USER;
  if (functionName === "getApproved") return ADAPTER;
  if (functionName === "positionTokens") return [USDC, WETH];
  if (functionName === "isAutomationPaused") return false;
  return null;
}

function mockPublicClient(
  overrides: Partial<ExecuteHarvestInput["publicClient"]> = {},
): ExecuteHarvestInput["publicClient"] {
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

describe("harvest validation", () => {
  it("builds bounded harvest opt-in permission scope", () => {
    const scope = buildHarvestOptInPermissionScope({
      user: USER,
      chainId: 31337,
      poolId: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
    });
    expect(scope.allowedActions).toEqual([
      "harvest",
      "pause-automation",
      "revoke-permission",
      "emergency-exit",
    ]);
    expect(permissionMaskIncludesHarvest(HARVEST_ACTION_MASK)).toBe(true);
  });

  it("rejects opt-in disabled and missing executor", () => {
    expectRejected(validateHarvestEnvironment(baseDeployments(), false), "opt-in-disabled");
    const d = { ...baseDeployments(), automationExecutor: undefined };
    expectRejected(validateHarvestEnvironment(d, true), "missing-automation-executor");
  });

  it("rejects revoked/expired/wrong-user permissions", () => {
    const now = Math.floor(Date.now() / 1000);
    expectRejected(
      validateHarvestPermissionSnapshot(
        {
          user: "0x0000000000000000000000000000000000000001" as Address,
          chainId: BigInt(31337),
          poolId: POOL_HASH,
          tokenA: USDC,
          tokenB: WETH,
          allowedActions: HARVEST_ACTION_MASK,
          expiresAt: BigInt(now + 100),
          revoked: false,
          paused: false,
        },
        { user: USER, chainId: 31337, poolId: POOL_HASH },
        now,
      ),
      "wrong-user",
    );

    expectRejected(
      validateHarvestPermissionSnapshot(
        {
          user: USER,
          chainId: BigInt(31337),
          poolId: POOL_HASH,
          tokenA: USDC,
          tokenB: WETH,
          allowedActions: HARVEST_ACTION_MASK,
          expiresAt: BigInt(now - 1),
          revoked: false,
          paused: false,
        },
        { user: USER, chainId: 31337, poolId: POOL_HASH },
        now,
      ),
      "permission-expired",
    );
  });
});

describe("executeAuthorizedHarvest", () => {
  it("happy path: proposal, tx, confirmed receipt, audit events", async () => {
    const audit = new HarvestAuditStore();
    const monitor = new OpenServMonitor();
    const walletClient = {
      writeContract: vi.fn(async () => "0xdeadbeef" as Hex),
    };
    const publicClient = mockPublicClient();

    const result = await executeAuthorizedHarvest({
      deployments: baseDeployments(),
      verifiedAdapters: baseDeployments().step2Adapters!,
      walletAddress: USER,
      walletChainId: 31337,
      poolCatalogueId: "USDC-cbBTC-UNI-005",
      poolIdHash: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      positionTokenId: "1",
      permissionId: PERM_ID,
      executionNonce: BigInt(99),
      adapter: ADAPTER,
      optInEnabled: true,
      feesUsd: 25,
      gasUsd: 4,
      idempotencyKey: "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex,
      manual: true,
      monitor,
      audit,
      publicClient,
      walletClient,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receiptStatus).toBe("success");
    expect(monitor.listProposals()).toHaveLength(1);
    expect(audit.list().some((e) => e.phase === "tx-confirmed")).toBe(true);
  });

  it("fail-closed when opt-in disabled", async () => {
    const result = await executeAuthorizedHarvest({
      deployments: baseDeployments(),
      verifiedAdapters: baseDeployments().step2Adapters!,
      walletAddress: USER,
      walletChainId: 31337,
      poolCatalogueId: "USDC-cbBTC-UNI-005",
      poolIdHash: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      positionTokenId: "1",
      permissionId: PERM_ID,
      executionNonce: BigInt(1),
      adapter: ADAPTER,
      optInEnabled: false,
      feesUsd: 25,
      gasUsd: 4,
      idempotencyKey: "0x4444444444444444444444444444444444444444444444444444444444444444" as Hex,
      manual: true,
      monitor: new OpenServMonitor(),
      audit: new HarvestAuditStore(),
      publicClient: mockPublicClient(),
      walletClient: { writeContract: vi.fn() },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("opt-in-disabled");
  });

  it("rejects duplicate idempotency and reverted receipts", async () => {
    const monitor = new OpenServMonitor();
    const proposal = buildHarvestProposal({
      user: USER,
      permissionId: PERM_ID,
      poolId: POOL_HASH,
      positionTokenId: "1",
      feesUsd: 10,
      gasUsd: 1,
      idempotencyKey: "0x5555555555555555555555555555555555555555555555555555555555555555" as Hex,
    })!;
    monitor.submit(proposal);
    const dup = monitor.submit(proposal);
    expect(dup.ok).toBe(false);

    const publicClient = mockPublicClient({
      waitForTransactionReceipt: vi.fn(async () => {
        throw new TransactionRevertedError("reverted", "0xbad" as Hex);
      }),
    });
    const result = await executeAuthorizedHarvest({
      deployments: baseDeployments(),
      verifiedAdapters: baseDeployments().step2Adapters!,
      walletAddress: USER,
      walletChainId: 31337,
      poolCatalogueId: "USDC-cbBTC-UNI-005",
      poolIdHash: POOL_HASH,
      tokenA: USDC,
      tokenB: WETH,
      positionTokenId: "1",
      permissionId: PERM_ID,
      executionNonce: BigInt(2),
      adapter: ADAPTER,
      optInEnabled: true,
      feesUsd: 25,
      gasUsd: 4,
      idempotencyKey: "0x6666666666666666666666666666666666666666666666666666666666666666" as Hex,
      manual: true,
      monitor: new OpenServMonitor(),
      audit: new HarvestAuditStore(),
      publicClient,
      walletClient: { writeContract: vi.fn(async () => "0xbad" as Hex) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("tx-reverted");
  });

  it("validates proposal binding to permission and pool", () => {
    const proposal = buildHarvestProposal({
      user: USER,
      permissionId: PERM_ID,
      poolId: POOL_HASH,
      positionTokenId: "1",
      feesUsd: 5,
      gasUsd: 1,
      idempotencyKey: "0x7777777777777777777777777777777777777777777777777777777777777777" as Hex,
    })!;
    expectRejected(
      validateHarvestProposalBinding(proposal, {
        user: USER,
        permissionId: PERM_ID,
        poolId: POOL_HASH,
        positionTokenId: "2",
      }),
      "invalid-position-token-id",
    );
  });

  it("rejects wrong chain and paused automation in preconditions", async () => {
    const defaultClient = mockPublicClient();
    const pausedClient = mockPublicClient({
      readContract: vi.fn(async (args: unknown) => {
        const functionName = (args as { functionName?: string }).functionName;
        if (functionName === "isAutomationPaused") return true;
        return defaultClient.readContract(args);
      }),
    });
    expectRejected(
      await validateHarvestPreconditions({
        deployments: baseDeployments(),
        verifiedAdapters: baseDeployments().step2Adapters!,
        walletAddress: USER,
        walletChainId: 1,
        poolCatalogueId: "USDC-cbBTC-UNI-005",
        poolIdHash: POOL_HASH,
        tokenA: USDC,
        tokenB: WETH,
        positionTokenId: "1",
        permissionId: PERM_ID,
        adapter: ADAPTER,
        optInEnabled: true,
        publicClient: mockPublicClient(),
      }),
      "wrong-chain",
    );

    expectRejected(
      await validateHarvestPreconditions({
        deployments: baseDeployments(),
        verifiedAdapters: baseDeployments().step2Adapters!,
        walletAddress: USER,
        walletChainId: 31337,
        poolCatalogueId: "USDC-cbBTC-UNI-005",
        poolIdHash: POOL_HASH,
        tokenA: USDC,
        tokenB: WETH,
        positionTokenId: "1",
        permissionId: PERM_ID,
        adapter: ADAPTER,
        optInEnabled: true,
        publicClient: pausedClient,
      }),
      "permission-paused",
    );
  });
});
