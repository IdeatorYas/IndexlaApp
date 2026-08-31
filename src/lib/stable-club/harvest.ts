import { getAddress, type Address, type Hex } from "viem";
import {
  permissionRegistryAbi,
  safetyControllerAbi,
  stableClubAutomationExecutorAbi,
  concentratedLiquidityAdapterAbi,
} from "@/lib/stable-club/abis";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import { isValidLocalDeployments } from "@/lib/stable-club/deployments";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import {
  buildHarvestProposal,
  OpenServMonitor,
  type OpenServProposal,
} from "@/lib/stable-club/openserv";
import { resolveVerifiedAdapterForPool, erc721PositionAbi } from "@/lib/stable-club/nft-approval";
import type { VerifiedClAdapterDeployment } from "@/lib/stable-club/nft-approval";
import {
  parsePositionTokenId,
  sortedTokenPair,
  validateHarvestPermissionSnapshot,
  validateHarvestProposalBinding,
  type HarvestValidationCode,
  type HarvestValidationResult,
  type OnChainPermissionSnapshot,
} from "@/lib/stable-club/harvest-validation";
import { assertSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import type { HarvestAuditStore } from "@/lib/stable-club/harvest-audit";

export type HarvestOptInKey = `${number}:${Lowercase<Address>}:${string}`;

export function harvestOptInStorageKey(
  chainId: number,
  user: Address,
  poolCatalogueId: string,
): HarvestOptInKey {
  return `${chainId}:${user.toLowerCase() as Lowercase<Address>}:${poolCatalogueId}`;
}

export type HarvestExecutionStatus =
  | "idle"
  | "validating"
  | "awaiting-wallet"
  | "pending-receipt"
  | "confirmed"
  | "failed";

export type HarvestUiStatus = {
  status: HarvestExecutionStatus;
  message: string | null;
  lastTxHash: Hex | null;
  lastValidationCode: HarvestValidationCode | null;
};

export type ExecuteHarvestInput = {
  deployments: StableClubLocalDeployments | null;
  verifiedAdapters: VerifiedClAdapterDeployment[];
  walletAddress: Address;
  walletChainId: number;
  poolCatalogueId: string;
  poolIdHash: Hex;
  tokenA: Address;
  tokenB: Address;
  positionTokenId: string;
  permissionId: Hex;
  executionNonce: bigint;
  adapter: Address;
  optInEnabled: boolean; // permission registered on-chain (automation opt-in)
  feesUsd: number;
  gasUsd: number;
  idempotencyKey: Hex;
  manual: boolean;
  nowSec?: number;
  monitor: OpenServMonitor;
  audit: HarvestAuditStore;
  publicClient: {
    getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
    readContract: (args: unknown) => Promise<unknown>;
    waitForTransactionReceipt: (args: { hash: Hex }) => Promise<{ status?: string; transactionHash?: Hex }>;
  };
  walletClient: {
    writeContract: (args: unknown) => Promise<Hex>;
  };
};

export type ExecuteHarvestResult =
  | {
      ok: true;
      proposal: OpenServProposal;
      txHash: Hex;
      receiptStatus: "success";
    }
  | {
      ok: false;
      code: HarvestValidationCode | "tx-reverted" | "tx-unknown";
      reason: string;
      proposal?: OpenServProposal | null;
      txHash?: Hex;
    };

function zeroUser(user: Address): boolean {
  return user.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

export function validateHarvestEnvironment(
  deployments: StableClubLocalDeployments | null,
  permissionRegistered: boolean,
): HarvestValidationResult {
  if (!permissionRegistered) {
    return {
      ok: false,
      code: "opt-in-disabled",
      reason: "Harvest permission not registered (automation opt-in required)",
    };
  }
  if (!deployments || !isValidLocalDeployments(deployments)) {
    return { ok: false, code: "missing-deployments", reason: "Local deployments unavailable" };
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
  if (
    deployments.network !== "hardhat-local" &&
    PRIVATE_BETA_LAUNCH_PARAMS.automation.harvestEnabled !== true
  ) {
    return {
      ok: false,
      code: "launch-harvest-disabled",
      reason: "Launch policy disables harvest automation",
    };
  }
  return { ok: true };
}

function isNonZero(addr: Address | undefined): boolean {
  return Boolean(addr && addr.toLowerCase() !== "0x0000000000000000000000000000000000000000");
}

export async function readPermissionSnapshot(
  publicClient: ExecuteHarvestInput["publicClient"],
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

export async function validateHarvestPreconditions(
  input: Omit<
    ExecuteHarvestInput,
    "walletClient" | "monitor" | "audit" | "executionNonce" | "feesUsd" | "gasUsd" | "idempotencyKey" | "manual"
  >,
): Promise<HarvestValidationResult> {
  const env = validateHarvestEnvironment(input.deployments, input.optInEnabled);
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

  const permCheck = validateHarvestPermissionSnapshot(
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

export async function executeAuthorizedHarvest(
  input: ExecuteHarvestInput,
): Promise<ExecuteHarvestResult> {
  const pre = await validateHarvestPreconditions(input);
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
    if (pre.code === "circuit-open") input.monitor.markFailed();
    return { ok: false, code: pre.code, reason: pre.reason };
  }

  const proposal = buildHarvestProposal({
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    positionTokenId: input.positionTokenId,
    feesUsd: input.feesUsd,
    gasUsd: input.gasUsd,
    idempotencyKey: input.idempotencyKey,
  });
  if (!proposal) {
    input.audit.append({
      phase: "failed",
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationCode: "fees-below-gas",
      validationReason: "Fees do not exceed gas estimate",
      manual: input.manual,
    });
    return { ok: false, code: "fees-below-gas", reason: "Fees do not exceed gas", proposal: null };
  }

  const bind = validateHarvestProposalBinding(proposal, {
    user: input.walletAddress,
    permissionId: input.permissionId,
    poolId: input.poolIdHash,
    positionTokenId: input.positionTokenId,
  });
  if (!bind.ok) {
    input.audit.append({
      phase: "failed",
      proposal,
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationCode: bind.code,
      validationReason: bind.reason,
      manual: input.manual,
    });
    return { ok: false, code: bind.code, reason: bind.reason, proposal };
  }

  const submit = input.monitor.submit(proposal);
  if (!submit.ok) {
    const code = submit.error as HarvestValidationCode;
    input.audit.append({
      phase: "failed",
      proposal,
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationCode: code,
      validationReason: submit.error,
      manual: input.manual,
    });
    if (submit.error === "circuit-open") input.monitor.markFailed();
    return { ok: false, code, reason: submit.error, proposal };
  }

  input.audit.append({
    phase: "proposal-submitted",
    proposal,
    user: input.walletAddress,
    chainId: input.walletChainId,
    poolId: input.poolCatalogueId,
    positionTokenId: input.positionTokenId,
    validationDecision: "approved",
    manual: input.manual,
  });

  const tokenId = parsePositionTokenId(input.positionTokenId)!;
  let txHash: Hex;
  try {
    txHash = await input.walletClient.writeContract({
      address: input.deployments!.automationExecutor!,
      abi: stableClubAutomationExecutorAbi,
      functionName: "harvest",
      args: [input.permissionId, input.executionNonce, input.adapter, tokenId],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Harvest transaction rejected";
    input.monitor.markFailed();
    input.audit.append({
      phase: "failed",
      proposal,
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "rejected",
      validationReason: reason,
      manual: input.manual,
    });
    return { ok: false, code: "tx-reverted", reason, proposal };
  }

  input.audit.append({
    phase: "tx-submitted",
    proposal,
    user: input.walletAddress,
    chainId: input.walletChainId,
    poolId: input.poolCatalogueId,
    positionTokenId: input.positionTokenId,
    validationDecision: "approved",
    txHash,
    manual: input.manual,
  });

  try {
    const receipt = await input.publicClient.waitForTransactionReceipt({ hash: txHash });
    assertSuccessfulTransactionReceipt(receipt, txHash);
    input.monitor.markSuccess();
    input.audit.append({
      phase: "tx-confirmed",
      proposal,
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
      validationDecision: "approved",
      txHash,
      receiptStatus: "success",
      manual: input.manual,
    });
    return { ok: true, proposal, txHash, receiptStatus: "success" };
  } catch (err) {
    input.monitor.markFailed();
    const receiptStatus =
      err instanceof Error && "receiptStatus" in err
        ? String((err as { receiptStatus?: string }).receiptStatus)
        : "unknown";
    const reason = err instanceof Error ? err.message : "Receipt not successful";
    input.audit.append({
      phase: "failed",
      proposal,
      user: input.walletAddress,
      chainId: input.walletChainId,
      poolId: input.poolCatalogueId,
      positionTokenId: input.positionTokenId,
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
      proposal,
      txHash,
    };
  }
}

export function mapHarvestResultToUiStatus(result: ExecuteHarvestResult): HarvestUiStatus {
  if (result.ok) {
    return {
      status: "confirmed",
      message: "Harvest confirmed on-chain",
      lastTxHash: result.txHash,
      lastValidationCode: null,
    };
  }
  return {
    status: "failed",
    message: result.reason,
    lastTxHash: result.txHash ?? null,
    lastValidationCode:
      result.code === "tx-reverted" || result.code === "tx-unknown"
        ? null
        : (result.code as HarvestValidationCode),
  };
}
