"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StableClubAvailablePools } from "@/components/stable-club/StableClubAvailablePools";
import { StableClubCompactDeposit } from "@/components/stable-club/StableClubCompactDeposit";
import {
  StableClubCategoryExplain,
  StableClubRiskDisclaimer,
} from "@/components/stable-club/StableClubCategoryExplain";
import { StableClubPositionDashboard } from "@/components/stable-club/StableClubPositionDashboard";
import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubBetaReadiness } from "@/components/stable-club/useStableClubBetaReadiness";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { LoadingSkeleton } from "@/components/states/AppStates";
import {
  FIVE_POOL_POSITIONS_REFRESH_EVENT,
  type FivePoolPositionsRefreshDetail,
} from "@/lib/stable-club/positions-refresh";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

type TabId = "position" | "pools";

function StableClubShellSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <div className="h-10 w-64 animate-pulse rounded-xl bg-[var(--color-panel-border)]/70" />
      <LoadingSkeleton title={label} lines={5} />
    </div>
  );
}

function StableClubConnectedShell({ depositsEnabled }: { depositsEnabled: boolean }) {
  const positions = useFivePoolPositions();
  const hasPositions = positions.positions.length > 0;
  const deploymentsBooting = positions.deploymentsLoading && !hasPositions;
  /** My Position always shows the five-row dashboard once deployments load — never replace with Deposit USDC. */
  const [tab, setTab] = useState<TabId>("position");
  const [addFundsOpen, setAddFundsOpen] = useState(false);

  const openAddFunds = useCallback(() => {
    setTab("position");
    setAddFundsOpen(true);
  }, []);

  const onDepositSuccess = useCallback(() => {
    setTab("position");
    setAddFundsOpen(false);
    void positions.refreshPositions();
  }, [positions]);

  useEffect(() => {
    if (hasPositions || positions.strategyRegistered) setTab("position");
  }, [hasPositions, positions.strategyRegistered]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FivePoolPositionsRefreshDetail>).detail;
      if (detail?.reason === "deposit-confirmed") {
        setTab("position");
        setAddFundsOpen(false);
      }
    };
    window.addEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, handler);
  }, []);

  if (deploymentsBooting) {
    return <StableClubShellSkeleton label="Loading Stable Club" />;
  }

  if (positions.deploymentsError && !positions.deployments) {
    return (
      <section className="app-panel rounded-2xl p-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--color-danger)]">
          Unable to load Stable Club
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]" role="alert">
          {positions.deploymentsError}
        </p>
        <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
          Refresh the page to retry. Your wallet stays connected.
        </p>
      </section>
    );
  }

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={
        tab === id
          ? "rounded-lg bg-[var(--color-brand)] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white"
          : "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)]"
      }
    >
      {label}
    </button>
  );

  const firstDepositForm = (
    <StableClubCompactDeposit
      depositsEnabled={depositsEnabled}
      onDepositSuccess={onDepositSuccess}
      title="Add Funds"
      subtitle="Deposit USDC · equal 20% across all five Base pools"
      compact
    />
  );

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Stable Club sections"
        className="inline-flex rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-bg-elevated)] p-1 shadow-sm"
      >
        {tabBtn("pools", "Available Pools")}
        {tabBtn("position", "My Position")}
      </div>

      {tab === "pools" ? (
        <div className="space-y-3">
          <StableClubAvailablePools
            depositsEnabled={depositsEnabled}
            showDepositCta={hasPositions || positions.strategyRegistered}
            onDepositClick={openAddFunds}
            depositSlot={
              !hasPositions && !positions.strategyRegistered
                ? firstDepositForm
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          <StableClubPositionDashboard
            positionsApi={positions}
            depositsEnabled={depositsEnabled}
            onAddFunds={() => setAddFundsOpen((v) => !v)}
            addFundsOpen={addFundsOpen}
          />
          {addFundsOpen ? (
            <StableClubCompactDeposit
              depositsEnabled={depositsEnabled}
              onDepositSuccess={onDepositSuccess}
              title="Add Funds"
              subtitle="New USDC is allocated 20% across all five pools"
              compact
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Dev-only local screenshot fixtures — localhost only. */
function DevUiPreview({ mode }: { mode: "deposit" | "positions" | "pools" }) {
  if (mode === "pools") return <StableClubAvailablePools showDepositCta depositsEnabled />;
  if (mode === "deposit") return <StableClubCompactDeposit depositsEnabled />;
  const fixture = {
    deploymentsLoading: false,
    deployments: {
      network: "base" as const,
      chainId: 8453,
      features: { exitAllToUsdc: true },
    },
    deploymentsError: null,
    onExpectedChain: true,
    expectedChainId: 8453,
    strategyId: "0xpreview",
    strategyRegistered: true,
    strategyRevoked: false,
    strategyExpired: false,
    positions: OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool, legIndex) => ({
      legIndex,
      poolId: pool.poolIdHash,
      poolLabel: pool.label,
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      tokenASymbol: pool.tokenA.symbol,
      tokenBSymbol: pool.tokenB.symbol,
      positionTokenId: BigInt(1000 + legIndex),
      liquidity: BigInt(1),
      amountA: BigInt(2_000_000),
      amountB: BigInt(0),
      allocationBps: BigInt(2000),
      rangeStatus: "in-range" as const,
      protocol: pool.protocol,
      npm: pool.infrastructure.npm,
      adapter: pool.infrastructure.npm,
      nftContract: pool.infrastructure.npm,
    })),
    positionsLoading: false,
    positionsError: null,
    stale: false,
    progress: "idle" as const,
    statusMessage: null,
    error: null,
    lastTxHash: null,
    explorerUrl: null,
    approvalTxHashes: [] as `0x${string}`[],
    legResults: [],
    directPlan: null,
    busy: false,
    refreshPositions: async () => undefined,
    exitIndividual: async () => undefined,
    exitAll: async () => undefined,
    exitAllToUsdc: async () => undefined,
    exitAllToUsdcAvailable: true,
    exitPercentToUsdcAvailable: true,
    exitPercentExecutable: true,
    withdrawStackKind: "primary" as const,
    withdrawPercent: async () => undefined,
    resumeIncompleteWithdraw: async () => undefined,
    incompleteWithdraw: null,
    strandedAssets: [],
    refreshStrandedAssets: async () => undefined,
    harvestAll: async () => undefined,
    compoundAll: async () => undefined,
    emergencyExitLeg: async () => undefined,
    emergencyExitAllSequential: async () => undefined,
    revokeStrategy: async () => undefined,
    showDirectExitPlan: () => undefined,
  };
  return (
    <StableClubPositionDashboard
      positionsApi={fixture as unknown as ReturnType<typeof useFivePoolPositions>}
      depositsEnabled
      onAddFunds={() => undefined}
      addFundsOpen={false}
    />
  );
}

export function StableClubBetaView({
  depositsEnabledOverride,
  loadingOverride,
  errorOverride,
}: {
  depositsEnabledOverride?: boolean;
  depositBlockersOverride?: readonly string[];
  loadingOverride?: boolean;
  errorOverride?: string | null;
  devToolsEnabled?: boolean;
} = {}) {
  const wallet = useStableClubWallet();
  const { readiness, loading, error, refetchBootstrap } = useStableClubBetaReadiness();
  const searchParams = useSearchParams();
  const depositsEnabled = depositsEnabledOverride ?? readiness.depositsEnabled;
  const readinessLoading = loadingOverride ?? loading;
  const readinessError = errorOverride !== undefined ? errorOverride : error;
  const connected = wallet.status === "connected" && Boolean(wallet.address);
  const connecting = wallet.status === "connecting";
  const wrongNetwork = wallet.status === "wrong-network";

  const [allowUiPreview, setAllowUiPreview] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    // Localhost + production QA screenshot path (?ui=positions|deposit|pools).
    setAllowUiPreview(
      host === "localhost" ||
        host === "127.0.0.1" ||
        host === "app.indexla.tech",
    );
  }, []);
  const uiPreview = allowUiPreview ? searchParams.get("ui") : null;

  const walletGate = (
    <section className="app-panel rounded-2xl p-8 text-center sm:p-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-dim)]">
        Stable Club · Base
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
        Five-pool USDC liquidity
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
        Connect your wallet to deposit, manage positions, and withdraw to USDC — non-custodial on Base.
      </p>
      {wrongNetwork ? (
        <>
          <button
            type="button"
            disabled={wallet.switchingNetwork}
            onClick={() => void wallet.switchToBase()}
            className="mt-6 inline-flex h-12 min-w-[220px] items-center justify-center rounded-xl bg-[var(--color-brand)] px-6 text-sm font-bold uppercase tracking-[0.06em] text-white disabled:opacity-60"
          >
            {wallet.switchingNetwork ? "Switching…" : "Switch to Base"}
          </button>
          <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
            Wrong network — Stable Club runs on Base.
          </p>
        </>
      ) : (
        <button
          type="button"
          disabled={connecting}
          onClick={() => void wallet.connect()}
          className="mt-6 inline-flex h-12 min-w-[220px] items-center justify-center rounded-xl bg-[var(--color-brand)] px-6 text-sm font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}
      {wallet.error ? (
        <p className="mt-4 text-sm text-[var(--color-danger)]" role="alert">
          {wallet.error}
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="stable-club-hub min-h-[70vh] px-3 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        {uiPreview === "positions" || uiPreview === "deposit" || uiPreview === "pools" ? (
          <DevUiPreview mode={uiPreview} />
        ) : wrongNetwork ? (
          walletGate
        ) : !connected ? (
          <>
            {walletGate}
            <StableClubAvailablePools depositsEnabled={false} showDepositCta={false} />
          </>
        ) : readinessError ? (
          <section className="app-panel rounded-2xl p-6">
            <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--color-danger)]">
              Stable Club unavailable
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]" role="alert">
              {readinessError}
            </p>
            <button
              type="button"
              onClick={() => void refetchBootstrap?.()}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-brand)] px-4 text-xs font-bold uppercase tracking-[0.08em] text-white"
            >
              Retry
            </button>
          </section>
        ) : readinessLoading ? (
          <>
            <StableClubAvailablePools depositsEnabled={false} showDepositCta={false} />
            <StableClubShellSkeleton label="Preparing your position" />
          </>
        ) : (
          <StableClubConnectedShell depositsEnabled={depositsEnabled} />
        )}
        <StableClubCategoryExplain />
        <StableClubRiskDisclaimer />
      </div>
    </div>
  );
}
