"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StableClubExecutionPanel } from "@/components/stable-club/StableClubExecutionPanel";
import { StableClubFivePoolDepositPanel } from "@/components/stable-club/StableClubFivePoolDepositPanel";
import { StableClubFivePoolPositionsPanel } from "@/components/stable-club/StableClubFivePoolPositionsPanel";
import { StableClubApprovalsPanel } from "@/components/stable-club/StableClubApprovalsPanel";
import {
  StableClubPoolCatalogue,
  StableClubPositionDashboard,
} from "@/components/stable-club/StableClubStep2Panels";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_EXECUTION_FEE_BPS,
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  isPoolLaunchReady,
} from "@/lib/stable-club/official-pools";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { OpenServMonitor, buildHarvestProposal } from "@/lib/stable-club/openserv";
import {
  buildPerTokenApproveTx,
  erc721PositionAbi,
  evaluateApproveEligibility,
  resolvePerTokenApprovalStatus,
  resolveStatusAfterApproveConfirmation,
  resolveVerifiedAdapterForPool,
  type NpmApprovalStatus,
} from "@/lib/stable-club/nft-approval";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import {
  buildIllustrativePositions,
  type StableClubPosition,
} from "@/lib/stable-club/positions";
import { STABLE_CLUB_INTERNAL_TEST_POOL } from "@/lib/stable-club/test-pool";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

type DeploymentsResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubLocalDeployments };

export function StableClubView({
  feeRecipientConfigured,
  baseRpcConfigured,
  preferLocalHardhat: _preferLocalHardhat = true,
}: {
  feeRecipientConfigured: boolean;
  baseRpcConfigured: boolean;
  preferLocalHardhat?: boolean;
}) {
  void _preferLocalHardhat;
  const wallet = useStableClubWallet();
  const expectedChainId = STABLE_CLUB_CHAIN_ID;
  const onExpectedChain = wallet.chainId === expectedChainId;

  const [testPoolValidated, setTestPoolValidated] = useState(false);
  const [activatedPoolIds, setActivatedPoolIds] = useState<string[]>([]);
  const monitor = useMemo(() => new OpenServMonitor(60, 10), []);
  const [proposalCount, setProposalCount] = useState(0);
  const [circuitBroken, setCircuitBroken] = useState(false);
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(null);
  const [approvalByPositionId, setApprovalByPositionId] = useState<
    Record<string, NpmApprovalStatus>
  >({});
  const [approvingPositionId, setApprovingPositionId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [lastApprovalTx, setLastApprovalTx] = useState<Hex | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stable-club/deployments");
        const json = (await res.json()) as DeploymentsResponse;
        if (!cancelled && json.configured) setDeployments(json.deployments);
      } catch {
        if (!cancelled) setDeployments(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chain = useMemo(
    () =>
      deployments?.network === "hardhat-local"
        ? STABLE_CLUB_LOCAL_CHAIN
        : wallet.chain ?? STABLE_CLUB_LOCAL_CHAIN,
    [deployments?.network, wallet.chain],
  );

  const publicClient = useMemo(() => {
    const rpc = deployments?.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL;
    if (wallet.provider) {
      return createPublicClient({ chain, transport: custom(wallet.provider) });
    }
    return createPublicClient({ chain, transport: http(rpc) });
  }, [chain, deployments?.rpcUrl, wallet.provider]);

  const verifiedAdapters = useMemo(
    () => verifiedStep2Adapters(deployments),
    [deployments],
  );

  const positions = useMemo((): StableClubPosition[] => {
    if (!wallet.address) return [];
    return buildIllustrativePositions(wallet.address).map((pos) => {
      const verified = resolveVerifiedAdapterForPool({
        deployments: verifiedAdapters,
        chainId: deployments?.chainId ?? wallet.chainId,
        poolId: pos.poolId,
      });
      const adapterAddress = verified?.adapter ?? null;
      const npmAddress = verified?.npm ?? null;
      const status =
        approvalByPositionId[pos.id] ??
        resolvePerTokenApprovalStatus({
          adapter: adapterAddress,
          approvedSpender: null,
        });
      return {
        ...pos,
        npmAddress,
        adapterAddress,
        npmApprovalStatus: status,
        // Illustrative rows stay unverified until indexer + ownership proof exist.
        dataVerifiedOnChain: false,
        positionTokenId: pos.positionTokenId,
      };
    });
  }, [
    wallet.address,
    wallet.chainId,
    deployments?.chainId,
    verifiedAdapters,
    approvalByPositionId,
  ]);

  const approvePositionNft = useCallback(
    async (position: StableClubPosition) => {
      setApprovalError(null);
      if (!wallet.provider || !wallet.address) {
        setApprovalError("Connect wallet before approving an NFT.");
        return;
      }

      const verified = resolveVerifiedAdapterForPool({
        deployments: verifiedAdapters,
        chainId: deployments?.chainId ?? wallet.chainId,
        poolId: position.poolId,
      });
      if (!verified) {
        setApprovalError("No verified adapter deployment for this pool/chain.");
        return;
      }

      setApprovingPositionId(position.id);
      try {
        const [adapterCode, npmCode, nftOwner] = await Promise.all([
          publicClient.getBytecode({ address: verified.adapter }),
          publicClient.getBytecode({ address: verified.npm }),
          publicClient.readContract({
            address: verified.npm,
            abi: erc721PositionAbi,
            functionName: "ownerOf",
            args: [BigInt(position.positionTokenId)],
          }),
        ]);

        const eligibility = evaluateApproveEligibility({
          walletAddress: wallet.address,
          walletChainId: wallet.chainId,
          expectedChainId: deployments?.chainId ?? expectedChainId,
          nftOwner: nftOwner as Address,
          positionTokenId: position.positionTokenId,
          adapter: verified.adapter,
          npm: verified.npm,
          adapterBytecode: adapterCode ?? null,
          npmBytecode: npmCode ?? null,
          fromVerifiedDeployments: true,
        });
        if (!eligibility.ok) {
          setApprovalError(eligibility.reason);
          return;
        }

        const walletClient = createWalletClient({
          account: wallet.address,
          chain,
          transport: custom(wallet.provider),
        });
        const tx = buildPerTokenApproveTx({
          npm: verified.npm,
          adapter: verified.adapter,
          tokenId: BigInt(position.positionTokenId),
        });
        const hash = await walletClient.writeContract(tx);
        setLastApprovalTx(hash);

        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        const approvedSpender = await publicClient.readContract({
          address: verified.npm,
          abi: erc721PositionAbi,
          functionName: "getApproved",
          args: [BigInt(position.positionTokenId)],
        });
        const status = resolveStatusAfterApproveConfirmation({
          receiptStatus: "success",
          adapter: verified.adapter,
          getApprovedSpender: approvedSpender as Address,
        });
        setApprovalByPositionId((prev) => ({ ...prev, [position.id]: status }));
        if (status !== "approved") {
          setApprovalError("Approve did not confirm on-chain getApproved(adapter).");
        }
      } catch (err) {
        setApprovalError(err instanceof Error ? err.message : "NFT approve failed");
        setApprovalByPositionId((prev) => ({ ...prev, [position.id]: "required" }));
      } finally {
        setApprovingPositionId(null);
      }
    },
    [
      wallet.provider,
      wallet.address,
      wallet.chainId,
      verifiedAdapters,
      deployments?.chainId,
      publicClient,
      chain,
      expectedChainId,
    ],
  );

  function activateReadyPools() {
    if (!testPoolValidated) return;
    // Dev UI only: Stage 1 allows UNI-005 when launch-ready. Never activate unavailable CL100 IDs.
    // This does not deploy or enable mainnet pools.
    setActivatedPoolIds(
      OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
        (p) => p.id === STAGE1_PRIVATE_BETA_POOL_ID && isPoolLaunchReady(p),
      ).map((p) => p.id),
    );
  }

  function simulateOpenServHarvest() {
    if (!wallet.address) return;
    const proposal = buildHarvestProposal({
      user: wallet.address,
      permissionId: keccak256(stringToHex("demo-permission")),
      poolId:
        OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === STAGE1_PRIVATE_BETA_POOL_ID)
          ?.poolIdHash ?? OFFICIAL_STABLE_CLUB_BASE_POOLS[1].poolIdHash,
      positionTokenId: "0",
      feesUsd: 25,
      gasUsd: 4,
      idempotencyKey: keccak256(stringToHex(`harvest-${Date.now()}`)),
    });
    if (!proposal) return;
    const result = monitor.submit(proposal);
    if (result.ok) {
      setProposalCount(monitor.listProposals().length);
      setCircuitBroken(monitor.circuitBroken);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="app-panel-soft rounded-[14px] border border-app-line p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-brand">
          Stable Club · Step 2
        </p>
        <h1 className="app-display mt-1 text-2xl font-bold text-app-ink sm:text-3xl">
          Base Pools + Dashboard + Automation
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          Uniswap V3 + Aerodrome Slipstream adapters, official Base catalogue, position
          dashboard, OpenServ proposals, and auto harvest / compound / rebalance with
          circuit breakers. Non-custodial — users own LP NFTs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
            Development only
          </span>
          <span className="rounded-md border border-app-line bg-app-panel px-2 py-1 text-[10px] font-semibold text-app-dim">
            chainId {expectedChainId}
          </span>
        </div>
      </header>

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Wallet · Base (local Hardhat for dev)</h2>
        <p className="mt-1 text-xs text-app-muted">
          Connect an EVM wallet. For local execution use RPC {STABLE_CLUB_LOCAL_RPC_URL}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {wallet.status === "disconnected" || wallet.status === "connecting" ? (
            <button
              type="button"
              disabled={wallet.status === "connecting"}
              onClick={() => void wallet.connect()}
              className="app-btn-primary h-9 px-4 text-xs font-bold"
            >
              {wallet.status === "connecting" ? "Connecting…" : "Connect Wallet"}
            </button>
          ) : (
            <>
              <span className="rounded-md border border-app-line bg-app-panel px-2 py-1 font-mono text-[11px] text-app-ink">
                {wallet.address}
              </span>
              {wallet.status === "wrong-network" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void wallet.switchToLocalHardhat()}
                    className="app-btn-secondary h-9 px-3 text-xs font-bold"
                  >
                    Switch to local Hardhat
                  </button>
                  <button
                    type="button"
                    onClick={() => void wallet.switchToBase()}
                    className="app-btn-secondary h-9 px-3 text-xs font-bold"
                  >
                    Switch to Base
                  </button>
                </>
              ) : (
                <span className="rounded-md border border-app-success/30 bg-app-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-app-success">
                  Connected · chain {wallet.chainId}
                </span>
              )}
              <button
                type="button"
                onClick={wallet.disconnect}
                className="app-btn-secondary h-9 px-3 text-xs font-bold"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
        {wallet.error ? (
          <p className="mt-2 text-[11px] text-app-danger">{wallet.error}</p>
        ) : null}
        <p className="mt-2 text-[11px] text-app-dim">
          Status: {wallet.status}
          {wallet.status === "connected" && !onExpectedChain ? " · verify chainId" : ""}
          {" · "}
          Verified Step 2 adapters: {verifiedAdapters.length}
        </p>
      </section>

      <StableClubPoolCatalogue
        activatedPoolIds={activatedPoolIds}
        testPoolValidated={testPoolValidated}
      />

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Activation gate</h2>
        <p className="mt-1 text-xs text-app-muted">
          Official pools unlock only after the private internal test pool has been validated.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTestPoolValidated(true)}
            className="app-btn-secondary h-9 px-3 text-xs font-bold"
          >
            Mark test-pool validated
          </button>
          <button
            type="button"
            disabled={!testPoolValidated}
            onClick={activateReadyPools}
            className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"
          >
            Activate five official Base pools
          </button>
          <button
            type="button"
            disabled={!wallet.address || !testPoolValidated}
            onClick={simulateOpenServHarvest}
            className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
          >
            Simulate OpenServ harvest proposal
          </button>
        </div>
      </section>

      <StableClubPositionDashboard
        positions={positions}
        pendingProposals={proposalCount}
        circuitBroken={circuitBroken}
        onApprovePosition={(pos) => void approvePositionNft(pos)}
        approvingPositionId={approvingPositionId}
      />
      {approvalError ? (
        <p className="text-[11px] text-app-danger">{approvalError}</p>
      ) : null}
      {lastApprovalTx ? (
        <p className="font-mono text-[10px] text-app-dim">NFT approve tx: {lastApprovalTx}</p>
      ) : null}

      <StableClubApprovalsPanel
        environment="local"
        feeRouterAddress={deployments?.feeRouter as Address | undefined}
        executorAddress={deployments?.executor as Address | undefined}
      />
      <StableClubFivePoolDepositPanel />
      <StableClubFivePoolPositionsPanel />
      <StableClubExecutionPanel />

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Step 2 architecture</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-app-muted">
          <li>Uniswap V3 + Aerodrome Slipstream concentrated-liquidity adapters</li>
          <li>Oracle Guard + MevGuard + SafetyController circuit breakers</li>
          <li>OpenServ typed proposals only — no keys, no arbitrary calldata</li>
          <li>
            Auto-harvest / compound / rebalance via Automation Executor (1% fee on swaps only)
          </li>
          <li>
            Fee Router — {STABLE_CLUB_EXECUTION_FEE_BPS / 100}% charged on swaps only
          </li>
          <li>Step 1 core executor and test-pool shell preserved</li>
        </ul>
        <p className="mt-3 text-[11px] text-app-dim">
          Fee recipient configured: {feeRecipientConfigured ? "yes" : "pending"}
          {" · "}
          Base RPC configured (server/fork tests): {baseRpcConfigured ? "yes" : "no"}
        </p>
      </section>

      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Internal test pool (dev only)</h2>
        <p className="mt-1 text-xs text-app-muted">{STABLE_CLUB_INTERNAL_TEST_POOL.note}</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-app-dim">Pool ID</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-app-ink">
              {STABLE_CLUB_INTERNAL_TEST_POOL.id}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-app-dim">Adapter</dt>
            <dd className="mt-0.5 text-app-ink">{STABLE_CLUB_INTERNAL_TEST_POOL.adapterKind}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-app-dim">
          Not one of the {OFFICIAL_STABLE_CLUB_BASE_POOLS.length} official Base catalogue pools.
        </p>
      </section>

      <p className="text-center text-[11px] text-app-dim">
        Step 3 covers audit, multisig/timelock and capped mainnet launch.
        {" "}
        <Link href="/app" className="text-app-brand underline-offset-2 hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
