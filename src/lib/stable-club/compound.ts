import { type Address, type Hex } from "viem";
import {
  permissionRegistryAbi,
  safetyControllerAbi,
  stableClubAutomationExecutorAbi,
  concentratedLiquidityAdapterAbi,
  erc20Abi,
} from "@/lib/stable-club/abis";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import { isValidLocalDeployments } from "@/lib/stable-club/deployments";
import {
  isLaunchAutomationEnabledForEnvironment,
  launchAutomationDisabledCode,
  launchAutomationDisabledReason,
} from "@/lib/stable-club/local-automation-policy";
import { assertRuntimeAutomationPolicy } from "@/lib/stable-club/runtime-deployments";
import { buildCompoundProposal } from "@/lib/stable-club/openserv";
import { resolveVerifiedAdapterForPool, erc721PositionAbi } from "@/lib/stable-club/nft-approval";
import type { VerifiedClAdapterDeployment } from "@/lib/stable-club/nft-approval";
import {
  COMPOUND_OPENSERV_CONNECTED,
  parsePositionTokenId,
  sortedTokenPair,
  validateCompoundPermissionSnapshot,
  validateCompoundProposalBinding,
  validateCompoundSpendParams,
  type CompoundValidationCode,
  type CompoundValidationResult,
  type LiveCollectibleFeeSnapshot,
  type OnChainPermissionSnapshot,
} from "@/lib/stable-club/compound-validation";
import { assertSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import type { CompoundAuditStore } from "@/lib/stable-club/compound-audit";

export type CompoundExecutionStatus =
  | "idle"
  | "validating"
  | "awaiting-wallet"
  | "pending-receipt"
  | "confirmed"
  | "failed";

export type CompoundUiStatus = {
  status: CompoundExecutionStatus;
  message: string | null;
  lastTxHash: Hex | null;
  lastValidationCode: CompoundValidationCode | null;
  automationAvailable: boolean;
};

export type CompoundSpendInput = {
  rewardToken: Address;
  tokenA: Address;
  tokenB: Address;
  swapAmount: bigint;
  minAmountOut: bigint;
  amountA: bigint;
  amountB: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  slippageBps: bigint;
  swapDeadline: bigint;
  quotedAmountOut: bigint;
};

export type ExecuteCompoundInput = {
  deployments: StableClubLocalDeployments | null;
  verifiedAdapters: VerifiedClAdapterDeployment[];
  walletAddress: Address;
  walletChainId: number;
  poolCatalogueId: string;
  poolIdHash: Hex;
  positionTokenId: string;
  permissionId: Hex;
  executionNonce: bigint;
  adapter: Address;
  optInEnabled: boolean;
  spend: CompoundSpendInput;
  proposalDeadline: bigint;
  idempotencyKey: Hex;
  manual: boolean;
  nowSec?: number;
  audit: CompoundAuditStore;
  publicClient: {
    getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
    readContract: (args: unknown) => Promise<unknown>;
    waitForTransactionReceipt: (args: {
      hash: Hex;
    }) => Promise<{ status?: string; transactionHash?: Hex }>;
  };
  walletClient: {
    writeContract: (args: unknown) => Promise<Hex>;
  };
};

export type ExecuteCompoundResult =
  | {
      ok: true;
      proposalId: Hex;
      txHash: Hex;
      receiptStatus: "success";
    }
  | {
      ok: false;
      code: CompoundValidationCode | "tx-reverted" | "tx-unknown";
      reason: string;
      proposalId?: Hex;
      txHash?: Hex;
    };

function zeroUser(user: Address): boolean {
  return user.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

function isNonZero(addr: Address | undefined): boolean {
  return Boolean(addr && addr.toLowerCase() !== "0x0000000000000000000000000000000000000000");
}

export function validateCompoundEnvironment(
  deployments: StableClubLocalDeployments | null,
  permissionRegistered: boolean,
): CompoundValidationResult {
  if (!permissionRegistered) {
    return {
      ok: false,
      code: "opt-in-disabled",
      reason: "Compound permission not registered (automation opt-in required)",
    };
  }
  if (!deployments) {
    return { ok: false, code: "missing-deployments", reason: "Local deployments unavailable" };
  }
  if (!isLaunchAutomationEnabledForEnvironment("compound", deployments)) {
    return {
      ok: false,
      code: launchAutomationDisabledCode("compound") as CompoundValidationCode,
      reason: launchAutomationDisabledReason("compound"),
    };
  }
  if (!isValidLocalDeployments(deployments)) {
    return { ok: false, code: "missing-deployments", reason: "Local deployments unavailable" };
  }
  try {
    assertRuntimeAutomationPolicy(deployments);
  } catch (err) {
    return {
      ok: false,
      code: "launch-compound-disabled",
      reason: err instanceof Error ? err.message : "Automation policy rejected",
    };
  }
  if (!deployments.automationExecutor || !isNonZero(deployments.automationExecutor)) {
    return {
      ok: false,
      code: "missing-automation-executor",
      reason: "Automation executor not configured",
    };
  }
  if (!deployments.permissionRegistry || !isNonZero(deployments.permissionRegistry)) {
    return {
      ok: false,
      code: "missing-permission-registry",
      reason: "Permission registry not configured",
    };
  }
  return { ok: true };
}

export async function readPermissionSnapshot(
  publicClient: ExecuteCompoundInput["publicClient"],
  permissionRegistry: Address,
  permissionId: Hex,
): Promise<OnChainPermissionSnapshot | null> {
  const perm = (await publicClient.readContract({
    address: permissionRegistry,
    abi: permissionRegistryAbi,
    functionName: "getPermission",
    args: [permissionId],
  })) as OnChainPermissionSnapshot & { user: Address };
  if (zeroUser(perm.user)) return null;
  return perm;
}

/** Read ERC-20 decimals for permission tokenA from chain. Fail closed → null. */
export async function readOnChainTokenDecimals(
  publicClient: ExecuteCompoundInput["publicClient"],
  token: Address,
): Promise<number | null> {
  try {
    const raw = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
      args: [],
    })) as number | bigint;
    const decimals = Number(raw);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
    return decimals;
  } catch {
    return null;
  }
}

/** Read adapter collectible fees + position token order. Fail closed → null. */
export async function readLiveCollectibleFees(
  publicClient: ExecuteCompoundInput["publicClient"],
  adapter: Address,
  positionTokenId: bigint,
): Promise<LiveCollectibleFeeSnapshot | null> {
  try {
    const [token0, token1] = (await publicClient.readContract({
      address: adapter,
      abi: concentratedLiquidityAdapterAbi,
      functionName: "positionTokens",
      args: [positionTokenId],
    })) as readonly [Address, Address];
    const [fee0, fee1] = (await publicClient.readContract({
      address: adapter,
      abi: concentratedLiquidityAdapterAbi,
      functionName: "collectibleFees",
      args: [positionTokenId],
    })) as readonly [bigint, bigint];
    if (
      !token0 ||
      !token1 ||
      token0.toLowerCase() === "0x0000000000000000000000000000000000000000" ||
      token1.toLowerCase() === "0x0000000000000000000000000000000000000000"
    ) {
      return null;
    }
    return { token0, token1, fee0, fee1 };
  } catch {
    return null;
  }
}

export async function validateCompoundPreconditions(
  input: Omit<
    ExecuteCompoundInput,
    "walletClient" | "audit" | "executionNonce" | "spend" | "proposalDeadline" | "idempotencyKey" | "manual"
  > & { tokenA: Address; tokenB: Address },
): Promise<CompoundValidationResult> {
  const env = validateCompoundEnvironment(input.deployments, input.optInEnabled);
  if (!env.ok) return env;

  if (input.walletChainId !== input.deployments!.chainId) {
    return { ok: false, code: "wrong-chain", reason: "Wallet on wrong chain" };
  }

  const tokenId = parsePositionTokenId(input.positionTokenId);
  if (tokenId == null) {
    return {
      ok: false,
      code: "invalid-position-token-id",
      reason: "Position tokenId must be a positive integer",
    };
  }

  const verified =
    resolveVerifiedAdapterForPool({
      deployments: input.verifiedAdapters,
      chainId: input.deployments!.chainId,
      poolId: input.poolCatalogueId,
    }) ?? null;
  if (!verified || verified.adapter.toLowerCase() !== input.adapter.toLowerCase()) {
    return { ok: false, code: "missing-adapter", reason: "Verified adapter binding missing" };
  }

  const perm = await readPermissionSnapshot(
    input.publicClient,
    input.deployments!.permissionRegistry,
    input.permissionId,
  );
  if (!perm) {
    return {
      ok: false,
      code: "permission-not-registered",
      reason: "Permission not registered",
    };
  }

  const permCheck = validateCompoundPermissionSnapshot(
    perm,
    {
      user: input.walletAddress,
      chainId: input.deployments!.chainId,
      poolId: input.poolIdHash,
    },
    input.nowSec ?? Math.floor(Date.now() / 1000),
  );
  if (!permCheck.ok) return permCheck;

  const [expected0, expected1] = sortedTokenPair(input.tokenA, input.tokenB);
  if (
    perm.tokenA.toLowerCase() !== expected0.toLowerCase() ||
    perm.tokenB.toLowerCase() !== expected1.toLowerCase()
  ) {
    return { ok: false, code: "wrong-pool-id", reason: "Permission token binding mismatch" };
  }

  const [adapterCode, npmCode] = await Promise.all([
    input.publicClient.getBytecode({ address: input.adapter }),
    input.publicClient.getBytecode({ address: verified.npm }),
  ]);
  if (!adapterCode || adapterCode === "0x") {
    return { ok: false, code: "missing-adapter", reason: "Adapter has no runtime code" };
  }
  if (!npmCode || npmCode === "0x") {
    return { ok: false, code: "missing-adapter", reason: "NPM has no runtime code" };
  }

  const adapterPoolId = (await input.publicClient.readContract({
    address: input.adapter,
    abi: concentratedLiquidityAdapterAbi,
    functionName: "poolId",
  })) as Hex;
  if (adapterPoolId.toLowerCase() !== input.poolIdHash.toLowerCase()) {
    return { ok: false, code: "wrong-pool-id", reason: "Adapter poolId mismatch" };
  }

  let owner: Address;
  try {
    owner = (await input.publicClient.readContract({
      address: verified.npm,
      abi: erc721PositionAbi,
      functionName: "ownerOf",
      args: [tokenId],
    })) as Address;
  } catch {
    return {
      ok: false,
      code: "invalid-position-token-id",
      reason: "Position NFT not found on NPM",
    };
  }
  if (owner.toLowerCase() !== input.walletAddress.toLowerCase()) {
    return { ok: false, code: "wrong-user", reason: "Wallet does not own position NFT" };
  }

  const approved = (await input.publicClient.readContract({
    address: verified.npm,
    abi: erc721PositionAbi,
    functionName: "getApproved",
    args: [tokenId],
  })) as Address;
  if (approved.toLowerCase() !== input.adapter.toLowerCase()) {
    return {
      ok: false,
      code: "missing-adapter",
      reason: "Adapter is not getApproved spender for tokenId",
    };
  }

  const [pos0, pos1] = (await input.publicClient.readContract({
    address: input.adapter,
    abi: concentratedLiquidityAdapterAbi,
    functionName: "positionTokens",
    args: [tokenId],
  })) as readonly [Address, Address];
  if (
    pos0.toLowerCase() !== expected0.toLowerCase() ||
    pos1.toLowerCase() !== expected1.toLowerCase()
  ) {
    return { ok: false, code: "wrong-pool-id", reason: "Position token pair mismatch" };
  }

  if (input.deployments!.safetyController && isNonZero(input.deployments!.safetyController)) {
    const paused = (await input.publicClient.readContract({
      address: input.deployments!.safetyController!,
      abi: safetyControllerAbi,
      functionName: "isAutomationPaused",
      args: [input.poolIdHash],
    })) as boolean;
    if (paused) {
      return { ok: false, code: "permission-paused", reason: "Automation paused by safety policy" };
    }
  }

  return { ok: true };
}

/**
 * Manual compound — wallet-signed atomic compound().
 * Keeper/OpenServ automation remains unavailable until publisher is connected.
 */
export async function executeAuthorizedCompound(
  input: ExecuteCompoundInput,
): Promise<ExecuteCompoundResult> {
  const pre = await validateCompoundPreconditions({
    ...input,
    tokenA: input.spend.tokenA,
    tokenB: input.spend.tokenB,
  });
  input.audit.append({
    phase: "validation",
    user: input.walletAddress,
    chainId: input.walletChainId,
    poolId: input.poolCatalogueId,
    positionTokenId: input.positionTokenId,
    validationDecision: pre.ok ? "approved" : "rejected",
    validationCode: pre.ok ? undefined : pre.code,
    validationReason: pre.ok ? undefined : pre.reason,
    manual: input.manual,
  });
  if (!pre.ok) {
    return { ok: false, code: pre.code, reason: pre.reason };
  }

  const spendCheck = validateCompoundSpendParams(input.spend);
  if (!spendCheck.ok) {
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationCode: spendCheck.code,
      validationReason: spendCheck.reason,
      manual: input.manual,
    });
    return { ok: false, code: spendCheck.code, reason: spendCheck.reason };
  }

  const tokenId = parsePositionTokenId(input.positionTokenId)!;
  const built = buildCompoundProposal({
    chainId: input.deployments!.chainId,
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    adapter: input.adapter,
    positionTokenId: tokenId,
    executionNonce: input.executionNonce,
    deadline: input.proposalDeadline,
    idempotencyKey: input.idempotencyKey,
    rewardToken: input.spend.rewardToken,
    tokenA: input.spend.tokenA,
    tokenB: input.spend.tokenB,
    swapAmount: input.spend.swapAmount,
    minAmountOut: input.spend.minAmountOut,
    quotedAmountOut: input.spend.quotedAmountOut,
    amountA: input.spend.amountA,
    amountB: input.spend.amountB,
    amountAMin: input.spend.amountAMin,
    amountBMin: input.spend.amountBMin,
    slippageBps: input.spend.slippageBps,
    swapDeadline: input.spend.swapDeadline,
  });
  if (!built) {
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationCode: "proposal-null",
      validationReason: "Compound proposal fields invalid",
      manual: input.manual,
    });
    return { ok: false, code: "proposal-null", reason: "Compound proposal fields invalid" };
  }

  const bind = validateCompoundProposalBinding(built.fields, {
    chainId: input.deployments!.chainId,
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    adapter: input.adapter,
    positionTokenId: tokenId,
    executionNonce: input.executionNonce,
  });
  if (!bind.ok) {
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      proposalId: built.proposalId,
      validationDecision: "rejected",
      validationCode: bind.code,
      validationReason: bind.reason,
      manual: input.manual,
    });
    return { ok: false, code: bind.code, reason: bind.reason, proposalId: built.proposalId };
  }

  input.audit.append({
    phase: "proposal-built",
    user: input.walletAddress,
    chainId: input.walletChainId,
    poolId: input.poolCatalogueId,
    positionTokenId: input.positionTokenId,
    proposalId: built.proposalId,
    validationDecision: "approved",
    manual: input.manual,
  });

  let txHash: Hex;
  try {
    txHash = await input.walletClient.writeContract({
      address: input.deployments!.automationExecutor!,
      abi: stableClubAutomationExecutorAbi,
      functionName: "compound",
      args: [
        input.permissionId,
        input.executionNonce,
        input.adapter,
        tokenId,
        input.spend.rewardToken,
        input.spend.tokenA,
        input.spend.tokenB,
        input.spend.swapAmount,
        input.spend.minAmountOut,
        input.spend.amountA,
        input.spend.amountB,
        input.spend.amountAMin,
        input.spend.amountBMin,
        input.spend.slippageBps,
        input.spend.swapDeadline,
        input.spend.quotedAmountOut,
      ],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Compound transaction rejected";
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      proposalId: built.proposalId,
      validationDecision: "rejected",
      validationReason: reason,
      manual: input.manual,
    });
    return { ok: false, code: "tx-reverted", reason, proposalId: built.proposalId };
  }

  input.audit.append({
    phase: "tx-submitted",
    user: input.walletAddress,
    chainId: input.walletChainId,
    poolId: input.poolCatalogueId,
    positionTokenId: input.positionTokenId,
    proposalId: built.proposalId,
    validationDecision: "approved",
    txHash,
    manual: input.manual,
  });

  try {
    const receipt = await input.publicClient.waitForTransactionReceipt({ hash: txHash });
    assertSuccessfulTransactionReceipt(receipt, txHash);
    input.audit.append({
      phase: "tx-confirmed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      proposalId: built.proposalId,
      validationDecision: "approved",
      txHash,
      receiptStatus: "success",
      manual: input.manual,
    });
    return { ok: true, proposalId: built.proposalId, txHash, receiptStatus: "success" };
  } catch (err) {
    const receiptStatus =
      err instanceof Error && "receiptStatus" in err
        ? String((err as { receiptStatus?: string }).receiptStatus)
        : "unknown";
    const reason = err instanceof Error ? err.message : "Receipt not successful";
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      proposalId: built.proposalId,
      validationDecision: "rejected",
      txHash,
      receiptStatus,
      validationReason: reason,
      manual: input.manual,
    });
    return {
      ok: false,
      code: receiptStatus === "reverted" ? "tx-reverted" : "tx-unknown",
      reason,
      proposalId: built.proposalId,
      txHash,
    };
  }
}

export function mapCompoundResultToUiStatus(result: ExecuteCompoundResult): CompoundUiStatus {
  if (result.ok) {
    return {
      status: "confirmed",
      message: "Compound confirmed on-chain",
      lastTxHash: result.txHash,
      lastValidationCode: null,
      automationAvailable: COMPOUND_OPENSERV_CONNECTED,
    };
  }
  return {
    status: "failed",
    message: result.reason,
    lastTxHash: result.txHash ?? null,
    lastValidationCode:
      result.code === "tx-reverted" || result.code === "tx-unknown"
        ? null
        : (result.code as CompoundValidationCode),
    automationAvailable: COMPOUND_OPENSERV_CONNECTED,
  };
}

export function compoundAutomationStatusMessage(): string {
  return COMPOUND_OPENSERV_CONNECTED
    ? "OpenServ publisher/keeper connected"
    : "Automation unavailable until OpenServ publisher/keeper is connected";
}
