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
  STABLE_CLUB_EXECUTION_FEE_BPS,
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  isPoolLaunchReady,
} from "@/lib/stable-club/official-pools";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { useStableClubHarvest } from "@/components/stable-club/useStableClubHarvest";
import { useStableClubCompound } from "@/components/stable-club/useStableClubCompound";
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

  const [testPoolValidated, setTestPoolValidated] = useState(false);
  const [activatedPoolIds, setActivatedPoolIds] = useState<string[]>([]);
  const harvest = useStableClubHarvest();
  const compound = useStableClubCompound();
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(null);
  const expectedChainId = deployments?.chainId ?? STABLE_CLUB_LOCAL_CHAIN_ID;
  const onExpectedChain = wallet.chainId === expectedChainId;
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
    const rows = buildIllustrativePositions(wallet.address);
    const dev = harvest.deployments?.harvestDev;
    if (
      dev &&
      wallet.address.toLowerCase() === dev.testUser.toLowerCase() &&
      harvest.deployments?.network === "hardhat-local"
    ) {
      const verified = resolveVerifiedAdapterForPool({
        deployments: verifiedAdapters,
        chainId: harvest.deployments.chainId,
        poolId: dev.poolCatalogueId,
      });
      return [
        {
          id: "local-harvest-dev-1",
          poolId: dev.poolCatalogueId,
          poolLabel: "USDC/cbBTC 0.05% — Uniswap V3 (local harvest dev)",
          protocol: "uniswap-v3",
          chainId: harvest.deployments.chainId,
          owner: wallet.address,
          positionTokenId: dev.positionTokenId,
          npmAddress: verified?.npm ?? dev.npm,
          adapterAddress: verified?.adapter ?? dev.adapter,
          npmApprovalStatus:
            approvalByPositionId["local-harvest-dev-1"] ??
            resolvePerTokenApprovalStatus({
              adapter: verified?.adapter ?? dev.adapter,
              approvedSpender: verified?.adapter ?? dev.adapter,
            }),
          tokenASymbol: "USDC",
          tokenBSymbol: "cbBTC",
          liquidity: "100000000",
          feesEarnedUsd: "25.00",
          rewardsEarnedUsd: "0.00",
          rangeStatus: "in-range",
          lastUpdated: Math.floor(Date.now() / 1000),
          automation: {
            harvest: harvest.permissionRegistered,
            compound: compound.permissionRegistered,
            rebalance: false,
            paused: false,
          },
          dataVerifiedOnChain: true,
        },
      ];
    }
    return rows.map((pos) => {
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
    harvest.deployments,
    harvest.permissionRegistered,
    compound.permissionRegistered,
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
    setActivatedPoolIds(
      OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
        (p) => p.id === STAGE1_PRIVATE_BETA_POOL_ID && isPoolLaunchReady(p),
      ).map((p) => p.id),
    );
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
                  <span className="rounded-md border border-app-danger/30 bg-app-danger/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-app-danger">
                    Wrong network
                  </span>
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
        <h2 className="text-sm font-bold text-app-ink">Harvest permission (Step 2)</h2>
        <p className="mt-1 text-xs text-app-muted">
          On-chain harvest permission is the automation opt-in. Manual harvest is wallet-signed;
          keeper execution requires a stored OpenServ proposal (not connected in this build).
          Launch policy keeps harvestEnabled=false.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!wallet.address || harvest.busy || harvest.permissionRegistered}
            onClick={() => void harvest.registerHarvestPermission()}
            className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
          >
            Register harvest permission (automation opt-in)
          </button>
        </div>
        <p className="mt-2 text-[11px] text-app-dim">
          Permission: {harvest.permissionRegistered ? "registered (opt-in)" : "not registered"}
          {" · "}
          Manual status: {harvest.uiStatus.status}
          {harvest.uiStatus.message ? ` — ${harvest.uiStatus.message}` : ""}
        </p>
        {harvest.uiStatus.lastTxHash ? (
          <p className="mt-1 font-mono text-[10px] text-app-dim">
            Last harvest tx: {harvest.uiStatus.lastTxHash}
          </p>
        ) : null}
      </section>

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Compound permission (Step 2)</h2>
        <p className="mt-1 text-xs text-app-muted">
          Separate on-chain compound permission (compound bit, tokenA-denominated limits,
          slippage cap). Manual compound is wallet-signed via the atomic compound() path.
          Keeper automation stays unavailable until OpenServ publisher/keeper is connected.
          Launch policy keeps compoundEnabled=false outside local development.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!wallet.address || compound.busy || compound.permissionRegistered}
            onClick={() => void compound.registerCompoundPermission()}
            className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
          >
            Enable compound permission
          </button>
        </div>
        <p className="mt-2 text-[11px] text-app-dim">
          Permission: {compound.permissionRegistered ? "registered (opt-in)" : "not registered"}
          {" � "}
          Manual status: {compound.uiStatus.status}
          {compound.uiStatus.message ? ` � ${compound.uiStatus.message}` : ""}
        </p>
        <p className="mt-1 text-[11px] text-app-dim">{compound.automationStatusMessage}</p>
        {compound.uiStatus.lastTxHash ? (
          <p className="mt-1 font-mono text-[10px] text-app-dim">
            Last compound tx: {compound.uiStatus.lastTxHash}
          </p>
        ) : null}
      </section>

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
            Activate Stage 1 pool (UNI-005)
          </button>
        </div>
      </section>

      <StableClubPositionDashboard
        positions={positions}
        pendingProposals={harvest.proposalCount}
        circuitBroken={harvest.circuitBroken}
        onApprovePosition={(pos) => void approvePositionNft(pos)}
        approvingPositionId={approvingPositionId}
        harvestOptInEnabled={harvest.permissionRegistered}
        harvestBusy={harvest.busy}
        harvestUiStatus={harvest.uiStatus}
        onHarvestPosition={(pos) => {
          if (!pos.adapterAddress) return;
          void harvest.runHarvest({
            positionTokenId: pos.positionTokenId,
            adapter: pos.adapterAddress,
            feesUsd: Number.parseFloat(pos.feesEarnedUsd) || 0,
            gasUsd: 4,
            manual: true,
          });
        }}
        compoundOptInEnabled={compound.permissionRegistered}
        compoundBusy={compound.busy}
        compoundUiStatus={compound.uiStatus}
        compoundAutomationAvailable={compound.automationAvailable}
        compoundAutomationMessage={compound.automationStatusMessage}
        onCompoundPosition={(pos) => {
          if (!pos.adapterAddress) return;
          void compound.runCompound({
            positionTokenId: pos.positionTokenId,
            adapter: pos.adapterAddress,
            manual: true,
          });
        }}
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
