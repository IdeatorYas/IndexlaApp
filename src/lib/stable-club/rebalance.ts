import { type Address, type Hex } from "viem";
import {
  concentratedLiquidityAdapterAbi,
  safetyControllerAbi,
  stableClubAutomationExecutorAbi,
} from "@/lib/stable-club/abis";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import { isValidLocalDeployments } from "@/lib/stable-club/deployments";
import {
  isLaunchAutomationEnabledForEnvironment,
  launchAutomationDisabledCode,
  launchAutomationDisabledReason,
} from "@/lib/stable-club/local-automation-policy";
import { assertRuntimeAutomationPolicy } from "@/lib/stable-club/runtime-deployments";
import { buildRebalanceProposal } from "@/lib/stable-club/openserv";
import { erc721PositionAbi, resolveVerifiedAdapterForPool } from "@/lib/stable-club/nft-approval";
import type { VerifiedClAdapterDeployment } from "@/lib/stable-club/nft-approval";
import {
  readPermissionSnapshot,
} from "@/lib/stable-club/compound";
import { parsePositionTokenId, sortedTokenPair } from "@/lib/stable-club/compound-validation";
import {
  REBALANCE_OPENSERV_CONNECTED,
  validateRebalancePermissionSnapshot,
  validateRebalanceProposalBinding,
  validateRebalanceSpendParams,
  type RebalanceValidationCode,
  type RebalanceValidationResult,
} from "@/lib/stable-club/rebalance-validation";
import { assertSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import type { RebalanceAuditStore } from "@/lib/stable-club/rebalance-audit";

export type RebalanceExecutionStatus =
  | "idle"
  | "validating"
  | "awaiting-wallet"
  | "pending-receipt"
  | "confirmed"
  | "failed";

export type RebalanceUiStatus = {
  status: RebalanceExecutionStatus;
  message: string | null;
  lastTxHash: Hex | null;
  lastValidationCode: RebalanceValidationCode | null;
  automationAvailable: boolean;
};

export type RebalanceSpendInput = {
  tokenA: Address;
  tokenB: Address;
  newTickLower: number;
  newTickUpper: number;
  swapAmount: bigint;
  minAmountOut: bigint;
  closeAmountAMin: bigint;
  closeAmountBMin: bigint;
  mintAmountAMin: bigint;
  mintAmountBMin: bigint;
  slippageBps: bigint;
  swapDeadline: bigint;
  quotedAmountOut: bigint;
};

export type ExecuteRebalanceInput = {
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
  spend: RebalanceSpendInput;
  proposalDeadline: bigint;
  idempotencyKey: Hex;
  manual: boolean;
  nowSec?: number;
  audit: RebalanceAuditStore;
  publicClient: {
    getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
    readContract: (args: unknown) => Promise<unknown>;
    waitForTransactionReceipt: (args: {
      hash: Hex;
    }) => Promise<{ status?: string; transactionHash?: Hex }>;
  };
  walletClient: { writeContract: (args: unknown) => Promise<Hex> };
};

export type ExecuteRebalanceResult =
  | { ok: true; proposalId: Hex; txHash: Hex; receiptStatus: "success" }
  | {
      ok: false;
      code: RebalanceValidationCode | "tx-reverted" | "tx-unknown";
      reason: string;
      proposalId?: Hex;
      txHash?: Hex;
    };

function isNonZero(address: Address | undefined): boolean {
  return Boolean(address && address.toLowerCase() !== "0x0000000000000000000000000000000000000000");
}

export function validateRebalanceEnvironment(
  deployments: StableClubLocalDeployments | null,
  permissionRegistered: boolean,
): RebalanceValidationResult {
  if (!permissionRegistered) {
    return { ok: false, code: "opt-in-disabled", reason: "Rebalance permission not registered" };
  }
  if (!deployments) {
    return { ok: false, code: "missing-deployments", reason: "Local deployments unavailable" };
  }
  if (!isLaunchAutomationEnabledForEnvironment("rebalance", deployments)) {
    return {
      ok: false,
      code: launchAutomationDisabledCode("rebalance") as RebalanceValidationCode,
      reason: launchAutomationDisabledReason("rebalance"),
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
      code: "launch-rebalance-disabled",
      reason: err instanceof Error ? err.message : "Automation policy rejected",
    };
  }
  if (!isNonZero(deployments.automationExecutor)) {
    return {
      ok: false,
      code: "missing-automation-executor",
      reason: "Automation executor not configured",
    };
  }
  if (!isNonZero(deployments.permissionRegistry)) {
    return {
      ok: false,
      code: "missing-permission-registry",
      reason: "Permission registry not configured",
    };
  }
  return { ok: true };
}

export async function validateRebalancePreconditions(
  input: Omit<
    ExecuteRebalanceInput,
    "walletClient" | "audit" | "executionNonce" | "spend" | "proposalDeadline" | "idempotencyKey" | "manual"
  > & { tokenA: Address; tokenB: Address },
): Promise<RebalanceValidationResult> {
  const env = validateRebalanceEnvironment(input.deployments, input.optInEnabled);
  if (!env.ok) return env;
  const deployments = input.deployments!;
  if (input.walletChainId !== deployments.chainId) {
    return { ok: false, code: "wrong-chain", reason: "Wallet on wrong chain" };
  }
  const tokenId = parsePositionTokenId(input.positionTokenId);
  if (tokenId == null) {
    return { ok: false, code: "invalid-position-token-id", reason: "Position tokenId must be positive" };
  }
  const verified = resolveVerifiedAdapterForPool({
    deployments: input.verifiedAdapters,
    chainId: deployments.chainId,
    poolId: input.poolCatalogueId,
  });
  if (!verified || verified.adapter.toLowerCase() !== input.adapter.toLowerCase()) {
    return { ok: false, code: "missing-adapter", reason: "Verified adapter binding missing" };
  }
  const perm = await readPermissionSnapshot(
    input.publicClient,
    deployments.permissionRegistry,
    input.permissionId,
  );
  if (!perm) {
    return { ok: false, code: "permission-not-registered", reason: "Permission not registered" };
  }
  const permissionCheck = validateRebalancePermissionSnapshot(
    perm,
    { user: input.walletAddress, chainId: deployments.chainId, poolId: input.poolIdHash },
    input.nowSec ?? Math.floor(Date.now() / 1000),
  );
  if (!permissionCheck.ok) return permissionCheck;

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
  if (!adapterCode || adapterCode === "0x" || !npmCode || npmCode === "0x") {
    return { ok: false, code: "missing-adapter", reason: "Adapter or NPM has no runtime code" };
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
    return { ok: false, code: "invalid-position-token-id", reason: "Position NFT not found" };
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
    return { ok: false, code: "missing-adapter", reason: "Adapter is not approved for tokenId" };
  }
  const [pos0, pos1] = (await input.publicClient.readContract({
    address: input.adapter,
    abi: concentratedLiquidityAdapterAbi,
    functionName: "positionTokens",
    args: [tokenId],
  })) as readonly [Address, Address];
  if (pos0.toLowerCase() !== expected0.toLowerCase() || pos1.toLowerCase() !== expected1.toLowerCase()) {
    return { ok: false, code: "wrong-pool-id", reason: "Position token pair mismatch" };
  }
  if (deployments.safetyController && isNonZero(deployments.safetyController)) {
    const paused = (await input.publicClient.readContract({
      address: deployments.safetyController,
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

export async function executeAuthorizedRebalance(
  input: ExecuteRebalanceInput,
): Promise<ExecuteRebalanceResult> {
  const pre = await validateRebalancePreconditions({
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
  if (!pre.ok) return { ok: false, code: pre.code, reason: pre.reason };

  const spendCheck = validateRebalanceSpendParams(input.spend);
  if (!spendCheck.ok) return { ok: false, code: spendCheck.code, reason: spendCheck.reason };
  const tokenId = parsePositionTokenId(input.positionTokenId)!;
  const built = buildRebalanceProposal({
    chainId: input.deployments!.chainId,
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    adapter: input.adapter,
    positionTokenId: tokenId,
    executionNonce: input.executionNonce,
    deadline: input.proposalDeadline,
    idempotencyKey: input.idempotencyKey,
    ...input.spend,
  });
  if (!built) {
    return { ok: false, code: "proposal-null", reason: "Rebalance proposal fields invalid" };
  }
  const binding = validateRebalanceProposalBinding(built.fields, {
    chainId: input.deployments!.chainId,
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    adapter: input.adapter,
    positionTokenId: tokenId,
    executionNonce: input.executionNonce,
  });
  if (!binding.ok) {
    return { ok: false, code: binding.code, reason: binding.reason, proposalId: built.proposalId };
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
      functionName: "rebalance",
      args: [
        input.permissionId,
        input.executionNonce,
        input.adapter,
        tokenId,
        input.spend.tokenA,
        input.spend.tokenB,
        input.spend.newTickLower,
        input.spend.newTickUpper,
        input.spend.swapAmount,
        input.spend.minAmountOut,
        input.spend.closeAmountAMin,
        input.spend.closeAmountBMin,
        input.spend.mintAmountAMin,
        input.spend.mintAmountBMin,
        input.spend.slippageBps,
        input.spend.swapDeadline,
        input.spend.quotedAmountOut,
      ],
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Rebalance transaction rejected";
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
  } catch (error) {
    const receiptStatus =
      error instanceof Error && "receiptStatus" in error
        ? String((error as { receiptStatus?: string }).receiptStatus)
        : "unknown";
    return {
      ok: false,
      code: receiptStatus === "reverted" ? "tx-reverted" : "tx-unknown",
      reason: error instanceof Error ? error.message : "Receipt not successful",
      proposalId: built.proposalId,
      txHash,
    };
  }
}

export function mapRebalanceResultToUiStatus(result: ExecuteRebalanceResult): RebalanceUiStatus {
  if (result.ok) {
    return {
      status: "confirmed",
      message: "Rebalance confirmed on-chain",
      lastTxHash: result.txHash,
      lastValidationCode: null,
      automationAvailable: REBALANCE_OPENSERV_CONNECTED,
    };
  }
  return {
    status: "failed",
    message: result.reason,
    lastTxHash: result.txHash ?? null,
    lastValidationCode:
      result.code === "tx-reverted" || result.code === "tx-unknown"
        ? null
        : result.code,
    automationAvailable: REBALANCE_OPENSERV_CONNECTED,
  };
}

export function rebalanceAutomationStatusMessage(): string {
  return REBALANCE_OPENSERV_CONNECTED
    ? "OpenServ publisher/keeper connected"
    : "Automation unavailable until OpenServ publisher/keeper is connected";
}
